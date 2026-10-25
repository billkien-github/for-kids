import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type { QuestionBody } from '@for-kids/shared'

const pk = () => uuid('id').primaryKey().defaultRandom()
const ts = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () => ts('created_at').notNull().defaultNow()

// ---------- Tài khoản ----------

export const family = pgTable('family', {
  id: pk(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  starThresholds: smallint('star_thresholds').array().notNull().default(sql`'{50,75,90}'`),
  createdAt: createdAt(),
})

export const parentUser = pgTable('parent_user', {
  id: pk(),
  familyId: uuid('family_id').notNull().references(() => family.id),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  parentPinHash: text('parent_pin_hash').notNull(),
  createdAt: createdAt(),
})

export const child = pgTable('child', {
  id: pk(),
  familyId: uuid('family_id').notNull().references(() => family.id),
  name: text('name').notNull(),
  avatar: text('avatar').notNull(),
  grade: smallint('grade').notNull(), // 0 = mầm non
  pinHash: text('pin_hash'),
  createdAt: createdAt(),
  archivedAt: ts('archived_at'),
})

export const session = pgTable('session', {
  // sha256 của token trong cookie; token gốc không lưu ở server.
  id: text('id').primaryKey(),
  parentUserId: uuid('parent_user_id').notNull().references(() => parentUser.id, { onDelete: 'cascade' }),
  activeChildId: uuid('active_child_id').references(() => child.id, { onDelete: 'set null' }),
  parentUnlockedUntil: ts('parent_unlocked_until'),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
})

export const apiToken = pgTable('api_token', {
  id: pk(),
  familyId: uuid('family_id').notNull().references(() => family.id),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: text('scopes').array().notNull(),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
})

// ---------- Nội dung ----------

export const subject = pgTable(
  'subject',
  {
    id: pk(),
    familyId: uuid('family_id').references(() => family.id), // null = môn dùng chung
    code: text('code').notNull(),
    name: text('name').notNull(),
    ttsLang: text('tts_lang').notNull(),
  },
  (t) => [unique().on(t.familyId, t.code).nullsNotDistinct()],
)

export const topic = pgTable(
  'topic',
  {
    id: pk(),
    familyId: uuid('family_id').notNull().references(() => family.id),
    subjectId: uuid('subject_id').notNull().references(() => subject.id),
    gradeMin: smallint('grade_min').notNull(),
    gradeMax: smallint('grade_max').notNull(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [unique().on(t.familyId, t.subjectId, t.name)],
)

export const skill = pgTable(
  'skill',
  {
    id: pk(),
    familyId: uuid('family_id').notNull().references(() => family.id),
    subjectId: uuid('subject_id').notNull().references(() => subject.id),
    topicId: uuid('topic_id').references(() => topic.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    grade: smallint('grade'),
  },
  (t) => [unique().on(t.familyId, t.code)],
)

export const worksheetStatus = pgEnum('worksheet_status', ['draft', 'published', 'archived'])
export const worksheetSource = pgEnum('worksheet_source', ['manual', 'mcp'])
export const worksheetLayout = pgEnum('worksheet_layout', ['one_per_screen', 'grid'])

export const worksheet = pgTable(
  'worksheet',
  {
    id: pk(),
    familyId: uuid('family_id').notNull().references(() => family.id),
    subjectId: uuid('subject_id').notNull().references(() => subject.id),
    topicId: uuid('topic_id').references(() => topic.id),
    grade: smallint('grade').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    lang: text('lang'),
    layout: worksheetLayout('layout').notNull().default('one_per_screen'),
    status: worksheetStatus('status').notNull().default('draft'),
    source: worksheetSource('source').notNull(),
    sourceNote: text('source_note'),
    timeLimitSec: integer('time_limit_sec'),
    createdByTokenId: uuid('created_by_token_id').references(() => apiToken.id),
    publishedAt: ts('published_at'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.familyId, t.status, t.subjectId)],
)

export const question = pgTable(
  'question',
  {
    id: pk(),
    worksheetId: uuid('worksheet_id').notNull().references(() => worksheet.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    type: text('type').notNull(),
    body: jsonb('body').$type<QuestionBody>().notNull(),
    explanation: text('explanation'),
    points: numeric('points', { mode: 'number' }).notNull().default(1),
    ttsLang: text('tts_lang'),
  },
  (t) => [index().on(t.worksheetId, t.sortOrder)],
)

export const questionSkill = pgTable(
  'question_skill',
  {
    questionId: uuid('question_id').notNull().references(() => question.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id').notNull().references(() => skill.id),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.skillId] })],
)

export const asset = pgTable(
  'asset',
  {
    id: pk(),
    familyId: uuid('family_id').notNull().references(() => family.id),
    kind: text('kind').notNull().default('image'),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.familyId, t.sha256)],
)

// ---------- Giao bài và làm bài ----------

export const assignedBy = pgEnum('assigned_by', ['parent', 'token'])
export const attemptKind = pgEnum('attempt_kind', ['normal', 'review'])

export const assignment = pgTable(
  'assignment',
  {
    id: pk(),
    worksheetId: uuid('worksheet_id').notNull().references(() => worksheet.id),
    childId: uuid('child_id').notNull().references(() => child.id),
    assignedBy: assignedBy('assigned_by').notNull(),
    dueAt: ts('due_at'),
    createdAt: createdAt(),
    cancelledAt: ts('cancelled_at'),
  },
  (t) => [index().on(t.childId, t.dueAt)],
)

export const attempt = pgTable(
  'attempt',
  {
    id: pk(),
    childId: uuid('child_id').notNull().references(() => child.id),
    worksheetId: uuid('worksheet_id').references(() => worksheet.id),
    assignmentId: uuid('assignment_id').references(() => assignment.id),
    kind: attemptKind('kind').notNull().default('normal'),
    attemptNo: integer('attempt_no').notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    deadlineAt: ts('deadline_at'),
    submittedAt: ts('submitted_at'),
    autoSubmitted: boolean('auto_submitted').notNull().default(false),
    durationSec: integer('duration_sec'),
    totalPoints: numeric('total_points', { mode: 'number' }),
    earnedPoints: numeric('earned_points', { mode: 'number' }),
    scorePct: real('score_pct'),
    stars: smallint('stars'),
  },
  (t) => [
    index().on(t.childId, t.submittedAt),
    // attempt_no tăng dần theo từng bé + bộ bài; attempt_no = 1 là lần chính thức.
    unique().on(t.childId, t.worksheetId, t.attemptNo),
  ],
)

export const attemptAnswer = pgTable(
  'attempt_answer',
  {
    id: pk(),
    attemptId: uuid('attempt_id').notNull().references(() => attempt.id, { onDelete: 'cascade' }),
    // null khi câu hỏi bị xoá lúc sửa bài; lịch sử vẫn đúng nhờ question_snapshot.
    questionId: uuid('question_id').references(() => question.id, { onDelete: 'set null' }),
    questionSnapshot: jsonb('question_snapshot').notNull(),
    response: jsonb('response'),
    score: real('score'),
    isCorrect: boolean('is_correct'),
    timeMs: integer('time_ms'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.attemptId, t.questionId)],
)

// ---------- Kết quả và động viên ----------

export const skillMastery = pgTable(
  'skill_mastery',
  {
    childId: uuid('child_id').notNull().references(() => child.id),
    skillId: uuid('skill_id').notNull().references(() => skill.id),
    mastery: real('mastery').notNull(),
    answered: integer('answered').notNull().default(0),
    correct: integer('correct').notNull().default(0),
    lastSeenAt: ts('last_seen_at'),
  },
  (t) => [primaryKey({ columns: [t.childId, t.skillId] })],
)

export const reviewItem = pgTable(
  'review_item',
  {
    childId: uuid('child_id').notNull().references(() => child.id),
    questionId: uuid('question_id').notNull().references(() => question.id, { onDelete: 'cascade' }),
    box: smallint('box').notNull().default(1),
    dueOn: date('due_on').notNull(),
    wrongCount: integer('wrong_count').notNull().default(0),
    lastAnsweredAt: ts('last_answered_at'),
  },
  (t) => [primaryKey({ columns: [t.childId, t.questionId] }), index().on(t.childId, t.dueOn)],
)

export const starReason = pgEnum('star_reason', ['worksheet', 'review', 'badge', 'redeem', 'manual'])

export const starLedger = pgTable(
  'star_ledger',
  {
    id: pk(),
    childId: uuid('child_id').notNull().references(() => child.id),
    delta: integer('delta').notNull(),
    reason: starReason('reason').notNull(),
    refId: uuid('ref_id'),
    // Mô tả ngắn để hiện trong lịch sử sao (tên bài, tên huy hiệu, tên quà).
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.childId, t.createdAt)],
)

export const badge = pgTable('badge', {
  id: pk(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  rule: jsonb('rule').notNull(),
  bonusStars: integer('bonus_stars').notNull().default(0),
})

export const childBadge = pgTable(
  'child_badge',
  {
    childId: uuid('child_id').notNull().references(() => child.id),
    badgeId: uuid('badge_id').notNull().references(() => badge.id),
    earnedAt: ts('earned_at').notNull().defaultNow(),
    // Lần làm bài khiến bé đạt huy hiệu (để màn kết quả hiện "huy hiệu mới").
    attemptId: uuid('attempt_id').references(() => attempt.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.childId, t.badgeId] })],
)

export const reward = pgTable('reward', {
  id: pk(),
  familyId: uuid('family_id').notNull().references(() => family.id),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  costStars: integer('cost_stars').notNull(),
  active: boolean('active').notNull().default(true),
})

export const redemptionStatus = pgEnum('redemption_status', ['pending', 'approved', 'rejected'])

export const rewardRedemption = pgTable('reward_redemption', {
  id: pk(),
  childId: uuid('child_id').notNull().references(() => child.id),
  rewardId: uuid('reward_id').notNull().references(() => reward.id),
  costStars: integer('cost_stars').notNull(),
  status: redemptionStatus('status').notNull().default('pending'),
  createdAt: createdAt(),
  decidedAt: ts('decided_at'),
})

export const mcpAudit = pgTable(
  'mcp_audit',
  {
    id: pk(),
    tokenId: uuid('token_id').notNull().references(() => apiToken.id),
    tool: text('tool').notNull(),
    argsSummary: jsonb('args_summary'),
    ok: boolean('ok').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tokenId, t.createdAt)],
)
