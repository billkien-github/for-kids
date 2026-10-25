import { z } from 'zod'
import type { QuestionResponse } from './grading.js'
import type { QuestionBody } from './question.js'
import type { KidQuestionBody } from './sanitize.js'

// Dữ liệu trả về của REST API cho bài tập, giao bài, làm bài. Thời điểm là chuỗi ISO.

export type WorksheetStatus = 'draft' | 'published' | 'archived'
export type WorksheetLayout = 'one_per_screen' | 'grid'

export type WorksheetSummary = {
  id: string
  title: string
  subjectCode: string
  subjectName: string
  topic: string | null
  grade: number
  status: WorksheetStatus
  layout: WorksheetLayout
  timeLimitSec: number | null
  questionCount: number
  source: 'manual' | 'mcp'
  updatedAt: string
  publishedAt: string | null
}

export type WorksheetQuestion = {
  id: string
  body: QuestionBody
  explanation: string | null
  points: number
  ttsLang: string | null
  skillCodes: string[]
}

export type WorksheetDetail = WorksheetSummary & {
  description: string | null
  lang: string | null
  sourceNote: string | null
  ttsLang: string
  questions: WorksheetQuestion[]
}

export type Catalog = {
  subjects: { code: string; name: string; ttsLang: string }[]
  topics: { subjectCode: string; name: string; gradeMin: number; gradeMax: number }[]
  skills: { subjectCode: string; code: string; name: string; topic: string | null }[]
}

export type AssignmentView = {
  id: string
  worksheet: { id: string; title: string; subjectCode: string; subjectName: string; questionCount: number; timeLimitSec: number | null }
  child: { id: string; name: string; avatar: string }
  dueAt: string | null
  createdAt: string
  overdue: boolean
  /** Lần nộp đầu tiên sau khi được giao (null nếu chưa làm). */
  completedAt: string | null
  scorePct: number | null
  stars: number | null
}

export const AssignInput = z.object({
  worksheetId: z.uuid(),
  childIds: z.array(z.uuid()).min(1),
  dueAt: z.iso.datetime({ offset: true }).nullish(),
})
export type AssignInput = z.infer<typeof AssignInput>

export type LibraryItem = {
  id: string
  title: string
  subjectCode: string
  subjectName: string
  topic: string | null
  grade: number
  questionCount: number
  timeLimitSec: number | null
  bestScorePct: number | null
  bestStars: number | null
  attempts: number
}

export type KidHome = {
  child: { id: string; name: string; avatar: string; grade: number }
  stars: number
  streak: number
  /** Số câu đến hạn ôn hôm nay. */
  reviewDue: number
  today: AssignmentView[]
  library: LibraryItem[]
}

// ---------- Thành tích, quà ----------

export type BadgeView = { code: string; name: string; icon: string; bonusStars: number; earnedAt: string | null }

export type LedgerEntry = { id: string; delta: number; reason: 'worksheet' | 'review' | 'badge' | 'redeem' | 'manual'; note: string | null; createdAt: string }

export type RewardView = { id: string; name: string; icon: string; costStars: number; active: boolean }

export type RedemptionView = {
  id: string
  reward: { id: string; name: string; icon: string }
  child: { id: string; name: string; avatar: string }
  costStars: number
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
}

export type Achievements = {
  stars: number
  /** Số sao còn đổi được (trừ các yêu cầu đổi quà đang chờ duyệt). */
  available: number
  streak: number
  badges: BadgeView[]
  history: LedgerEntry[]
  rewards: RewardView[]
  redemptions: RedemptionView[]
}

export const RewardInput = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(16),
  costStars: z.number().int().min(1).max(10000),
  active: z.boolean().default(true),
})
export type RewardInput = z.infer<typeof RewardInput>

// ---------- Báo cáo ----------

export type SkillLevel = 'unrated' | 'needs_practice' | 'improving' | 'mastered'

export type SkillProgress = {
  code: string
  name: string
  subjectCode: string
  topic: string | null
  mastery: number
  answered: number
  correct: number
  level: SkillLevel
  lastSeenAt: string | null
}

export type ChildReport = {
  child: { id: string; name: string; avatar: string; grade: number }
  range: { from: string; to: string }
  /** "YYYY-MM-DD" hôm nay theo múi giờ của gia đình, để vẽ biểu đồ theo ngày khớp với server. */
  today: string
  streak: number
  stars: number
  /** Điểm trung bình lần chính thức (attempt_no = 1) theo môn. */
  subjects: { subjectCode: string; subjectName: string; avgScorePct: number; worksheets: number }[]
  /** Trung bình theo tuần (thứ Hai đầu tuần), lần chính thức. */
  weekly: { weekStart: string; avgScorePct: number; attempts: number }[]
  /** Số phút học mỗi ngày (mọi lần nộp, kể cả ôn tập). */
  daily: { date: string; minutes: number; attempts: number }[]
  skills: SkillProgress[]
  weakSkills: SkillProgress[]
  overdue: AssignmentView[]
  pending: AssignmentView[]
  recent: AttemptSummary[]
  reviewDue: number
}

export type Mistake = {
  attemptId: string
  worksheetTitle: string | null
  answeredAt: string
  question: QuestionBody
  response: unknown
  score: number
  skillCodes: string[]
}

// ---------- Cài đặt ----------

export const ChangePinInput = z.object({ currentPin: z.string(), newPin: z.string().regex(/^\d{4}$/, 'PIN gồm 4 chữ số') })
export const ChangePasswordInput = z.object({ currentPassword: z.string(), newPassword: z.string().min(8, 'Ít nhất 8 ký tự').max(200) })
export const StarThresholdsInput = z
  .object({ thresholds: z.tuple([z.number().int().min(1).max(100), z.number().int().min(1).max(100), z.number().int().min(1).max(100)]) })
  .refine((v) => v.thresholds[0] < v.thresholds[1] && v.thresholds[1] < v.thresholds[2], {
    path: ['thresholds'],
    message: 'Ngưỡng phải tăng dần (1 sao < 2 sao < 3 sao)',
  })

/** Số việc cần bố mẹ để ý, hiện thành chấm đếm trên menu. */
export type ParentSummary = { pendingRedemptions: number; overdueAssignments: number; draftWorksheets: number }

export type FamilySettings ={ name: string; starThresholds: [number, number, number] }

export type McpAuditEntry = { id: string; tokenName: string; tool: string; argsSummary: unknown; ok: boolean; createdAt: string }

// ---------- Làm bài ----------

export type AttemptItem = {
  /** id của attempt_answer: dùng làm khoá khi lưu câu trả lời. */
  id: string
  body: KidQuestionBody
  points: number
  ttsLang: string
  response: unknown
}

export type AttemptItemResult = {
  id: string
  /** Đề đầy đủ kèm đáp án, chỉ có sau khi nộp. */
  body: QuestionBody
  score: number | null
  isCorrect: boolean | null
  explanation: string | null
}

export type AttemptView = {
  id: string
  kind: 'normal' | 'review'
  attemptNo: number
  worksheet: { id: string; title: string; layout: WorksheetLayout; subjectCode: string } | null
  startedAt: string
  deadlineAt: string | null
  /** Giờ server lúc trả lời, để FE tính đếm ngược không phụ thuộc đồng hồ của iPad. */
  serverNow: string
  submittedAt: string | null
  autoSubmitted: boolean
  items: AttemptItem[]
  result: {
    scorePct: number
    stars: number
    /** Tổng sao được cộng nhờ lần làm này (bài, phiên ôn, huy hiệu mới). */
    starsGained: number
    earnedPoints: number
    totalPoints: number
    items: AttemptItemResult[]
    newBadges: { code: string; name: string; icon: string }[]
  } | null
}

export const StartAttemptInput = z.object({ worksheetId: z.uuid(), assignmentId: z.uuid().nullish() })
export const SaveAnswersInput = z.object({
  answers: z
    .array(z.object({ itemId: z.uuid(), response: z.unknown(), timeMs: z.number().int().min(0).nullish() }))
    .max(200),
})
export type SaveAnswersInput = z.infer<typeof SaveAnswersInput>

export type AttemptSummary = {
  id: string
  worksheetId: string | null
  worksheetTitle: string | null
  subjectCode: string | null
  attemptNo: number
  kind: 'normal' | 'review'
  startedAt: string
  submittedAt: string | null
  durationSec: number | null
  scorePct: number | null
  stars: number | null
  autoSubmitted: boolean
}

// ---------- Token MCP ----------

export const MCP_SCOPES = ['content:write', 'publish', 'assign', 'results:read'] as const
export type McpScope = (typeof MCP_SCOPES)[number]

export const CreateTokenInput = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1).default([...MCP_SCOPES]),
})

export type TokenInfo = {
  id: string
  name: string
  scopes: McpScope[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type { QuestionResponse }
