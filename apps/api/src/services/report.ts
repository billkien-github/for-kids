import { COMPLETION_ONLY_TYPES, localDate, skillLevel, weekStart, type ChildReport, type Mistake, type SkillProgress } from '@for-kids/shared'
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, notInArray, sql } from 'drizzle-orm'
import { findActiveChild } from '../db/children.js'
import { attempt, attemptAnswer, skill, skillMastery, subject, topic, worksheet } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError } from '../http.js'
import { listAssignments } from './assignments.js'
import { listChildAttempts, type QuestionSnapshot } from './attempts.js'
import { familyTimezone, reviewDueCount, starBalance, streakFor } from './progress.js'

const round1 = (x: number) => Math.round(x * 10) / 10

export async function skillProgress(deps: Deps, childId: string): Promise<SkillProgress[]> {
  const rows = await deps.db
    .select({
      code: skill.code,
      name: skill.name,
      subjectCode: subject.code,
      topic: topic.name,
      mastery: skillMastery.mastery,
      answered: skillMastery.answered,
      correct: skillMastery.correct,
      lastSeenAt: skillMastery.lastSeenAt,
    })
    .from(skillMastery)
    .innerJoin(skill, eq(skill.id, skillMastery.skillId))
    .innerJoin(subject, eq(subject.id, skill.subjectId))
    .leftJoin(topic, eq(topic.id, skill.topicId))
    .where(eq(skillMastery.childId, childId))
    .orderBy(asc(skillMastery.mastery))
  return rows.map((r) => ({
    ...r,
    mastery: round1(r.mastery * 100) / 100,
    level: skillLevel(r.mastery, r.answered),
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
  }))
}

/** Báo cáo của một bé trong khoảng [from, to] (§6 phụ huynh, mục 1). Mặc định 8 tuần gần nhất. */
export async function childReport(deps: Deps, familyId: string, childId: string, range: { from?: Date; to?: Date } = {}): Promise<ChildReport> {
  const { db } = deps
  const c = await findActiveChild(db, familyId, childId)
  if (!c) throw new HttpError(404, { error: 'not_found' })
  const now = deps.clock()
  const to = range.to ?? now
  const from = range.from ?? new Date(to.getTime() - 56 * 24 * 3600 * 1000)
  const tz = await familyTimezone(db, childId)

  const submitted = await db
    .select({
      attemptNo: attempt.attemptNo,
      kind: attempt.kind,
      submittedAt: attempt.submittedAt,
      durationSec: attempt.durationSec,
      scorePct: attempt.scorePct,
      subjectCode: subject.code,
      subjectName: subject.name,
    })
    .from(attempt)
    .leftJoin(worksheet, eq(worksheet.id, attempt.worksheetId))
    .leftJoin(subject, eq(subject.id, worksheet.subjectId))
    .where(and(eq(attempt.childId, childId), isNotNull(attempt.submittedAt), gte(attempt.submittedAt, from), lte(attempt.submittedAt, to)))
    .orderBy(asc(attempt.submittedAt))

  // §5.2: báo cáo năng lực chỉ dùng lần chính thức.
  const official = submitted.filter((a) => a.kind === 'normal' && a.attemptNo === 1 && a.scorePct !== null)

  const subjects = new Map<string, { subjectName: string; scores: number[] }>()
  for (const a of official) {
    const s = subjects.get(a.subjectCode!) ?? { subjectName: a.subjectName!, scores: [] }
    s.scores.push(a.scorePct!)
    subjects.set(a.subjectCode!, s)
  }

  const weeks = new Map<string, number[]>()
  for (const a of official) {
    const w = weekStart(localDate(a.submittedAt!, tz))
    weeks.set(w, [...(weeks.get(w) ?? []), a.scorePct!])
  }

  const days = new Map<string, { seconds: number; attempts: number }>()
  for (const a of submitted) {
    const d = localDate(a.submittedAt!, tz)
    const cur = days.get(d) ?? { seconds: 0, attempts: 0 }
    days.set(d, { seconds: cur.seconds + (a.durationSec ?? 0), attempts: cur.attempts + 1 })
  }

  const avg = (xs: number[]) => round1(xs.reduce((s, x) => s + x, 0) / xs.length)
  const skills = await skillProgress(deps, childId)
  const assignments = await listAssignments(db, familyId, { childId, pendingOnly: true, now })

  return {
    child: { id: c.id, name: c.name, avatar: c.avatar, grade: c.grade },
    range: { from: from.toISOString(), to: to.toISOString() },
    today: localDate(now, tz),
    streak: await streakFor(db, childId, now, tz),
    stars: await starBalance(db, childId),
    subjects: [...subjects].map(([subjectCode, s]) => ({ subjectCode, subjectName: s.subjectName, avgScorePct: avg(s.scores), worksheets: s.scores.length })),
    weekly: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, scores]) => ({ weekStart, avgScorePct: avg(scores), attempts: scores.length })),
    daily: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, minutes: Math.round(d.seconds / 6) / 10, attempts: d.attempts })),
    skills,
    weakSkills: skills.filter((s) => s.level === 'needs_practice'),
    overdue: assignments.filter((a) => a.overdue),
    pending: assignments.filter((a) => !a.overdue),
    recent: (await listChildAttempts(deps, familyId, childId, 10)).filter((a) => a.submittedAt),
    reviewDue: await reviewDueCount(db, childId, now, tz),
  }
}

/** Các câu sai gần đây kèm câu trả lời của bé, để agent soạn bài luyện đúng chỗ yếu (§8). */
export async function childMistakes(deps: Deps, familyId: string, childId: string, limit = 30): Promise<Mistake[]> {
  const { db } = deps
  const c = await findActiveChild(db, familyId, childId)
  if (!c) throw new HttpError(404, { error: 'not_found' })
  const rows = await db
    .select({
      attemptId: attempt.id,
      worksheetTitle: worksheet.title,
      submittedAt: attempt.submittedAt,
      snapshot: attemptAnswer.questionSnapshot,
      response: attemptAnswer.response,
      score: attemptAnswer.score,
    })
    .from(attemptAnswer)
    .innerJoin(attempt, eq(attempt.id, attemptAnswer.attemptId))
    .leftJoin(worksheet, eq(worksheet.id, attempt.worksheetId))
    .where(
      and(
        eq(attempt.childId, childId),
        isNotNull(attempt.submittedAt),
        lt(attemptAnswer.score, 1),
        // Câu chỉ tính hoàn thành (tô màu) chưa làm không phải là lỗi sai.
        notInArray(sql<string>`${attemptAnswer.questionSnapshot}->'body'->>'type'`, [...COMPLETION_ONLY_TYPES]),
      ),
    )
    .orderBy(desc(attempt.submittedAt))
    .limit(limit)

  const skillIds = [...new Set(rows.flatMap((r) => (r.snapshot as QuestionSnapshot).skillIds ?? []))]
  const codes = skillIds.length
    ? new Map((await db.select({ id: skill.id, code: skill.code }).from(skill).where(inArray(skill.id, skillIds))).map((s) => [s.id, s.code]))
    : new Map<string, string>()

  return rows.map((r) => {
    const snap = r.snapshot as QuestionSnapshot
    return {
      attemptId: r.attemptId,
      worksheetTitle: r.worksheetTitle,
      answeredAt: r.submittedAt!.toISOString(),
      question: snap.body,
      response: r.response,
      score: r.score!,
      skillCodes: (snap.skillIds ?? []).map((id) => codes.get(id)).filter((x): x is string => !!x),
    }
  })
}
