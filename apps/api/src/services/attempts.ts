import {
  gradeQuestion,
  sanitizeForKid,
  scorePercent,
  starsFor,
  TIME_LIMIT_GRACE_SEC,
  type AttemptSummary,
  type AttemptView,
  type QuestionBody,
  type SaveAnswersInput,
} from '@for-kids/shared'
import { and, asc, desc, eq, inArray, isNotNull, isNull, max, ne, sql } from 'drizzle-orm'
import { assignment, attempt, attemptAnswer, child, family, question, starLedger, subject, worksheet } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError } from '../http.js'

/** Bản chụp câu hỏi lúc bắt đầu làm (§3): sửa bài sau đó không làm sai lịch sử. */
export type QuestionSnapshot = {
  body: QuestionBody
  explanation: string | null
  points: number
  ttsLang: string
  sortOrder: number
}

type AttemptRow = typeof attempt.$inferSelect

const graceMs = TIME_LIMIT_GRACE_SEC * 1000

async function loadAttempt(deps: Deps, childId: string, attemptId: string): Promise<AttemptRow> {
  const [a] = await deps.db
    .select()
    .from(attempt)
    .where(and(eq(attempt.id, attemptId), eq(attempt.childId, childId)))
  if (!a) throw new HttpError(404, { error: 'not_found' })
  return a
}

const isExpired = (deps: Deps, a: AttemptRow) =>
  a.submittedAt === null && a.deadlineAt !== null && deps.clock().getTime() > a.deadlineAt.getTime() + graceMs

/** Hết giờ mà chưa nộp thì server tự nộp với các câu đã lưu trước hạn. */
async function finalizeIfExpired(deps: Deps, a: AttemptRow): Promise<AttemptRow> {
  if (!isExpired(deps, a)) return a
  await finalizeAttempt(deps, a.id, true)
  return loadAttempt(deps, a.childId, a.id)
}

export async function startAttempt(
  deps: Deps,
  familyId: string,
  childId: string,
  input: { worksheetId: string; assignmentId?: string | null },
): Promise<AttemptView> {
  const { db } = deps
  const [w] = await db
    .select({ id: worksheet.id, timeLimitSec: worksheet.timeLimitSec, lang: worksheet.lang, subjectTtsLang: subject.ttsLang })
    .from(worksheet)
    .innerJoin(subject, eq(subject.id, worksheet.subjectId))
    .where(and(eq(worksheet.id, input.worksheetId), eq(worksheet.familyId, familyId), eq(worksheet.status, 'published')))
  if (!w) throw new HttpError(404, { error: 'not_found', message: 'Không có bài này' })

  // Đang làm dở thì làm tiếp (tắt app giữa chừng vẫn làm tiếp được).
  const [open] = await db
    .select()
    .from(attempt)
    .where(
      and(eq(attempt.childId, childId), eq(attempt.worksheetId, w.id), eq(attempt.kind, 'normal'), isNull(attempt.submittedAt)),
    )
  if (open) {
    const current = await finalizeIfExpired(deps, open)
    if (current.submittedAt === null) return getAttemptView(deps, childId, current.id)
  }

  let assignmentId = input.assignmentId ?? null
  if (assignmentId) {
    const [a] = await db
      .select({ id: assignment.id })
      .from(assignment)
      .where(
        and(
          eq(assignment.id, assignmentId),
          eq(assignment.childId, childId),
          eq(assignment.worksheetId, w.id),
          isNull(assignment.cancelledAt),
        ),
      )
    if (!a) assignmentId = null
  }

  const qs = await db.select().from(question).where(eq(question.worksheetId, w.id)).orderBy(asc(question.sortOrder))
  if (qs.length === 0) throw new HttpError(409, { error: 'empty_worksheet', message: 'Bài chưa có câu hỏi' })

  const now = deps.clock()
  const id = await db.transaction(async (tx) => {
    const [{ last }] = (await tx
      .select({ last: max(attempt.attemptNo) })
      .from(attempt)
      .where(and(eq(attempt.childId, childId), eq(attempt.worksheetId, w.id)))) as [{ last: number | null }]
    const [row] = await tx
      .insert(attempt)
      .values({
        childId,
        worksheetId: w.id,
        assignmentId,
        kind: 'normal',
        attemptNo: (last ?? 0) + 1,
        startedAt: now,
        deadlineAt: w.timeLimitSec ? new Date(now.getTime() + w.timeLimitSec * 1000) : null,
      })
      .returning({ id: attempt.id })
    await tx.insert(attemptAnswer).values(
      qs.map((q) => ({
        attemptId: row!.id,
        questionId: q.id,
        questionSnapshot: {
          body: q.body,
          explanation: q.explanation,
          points: q.points,
          ttsLang: q.ttsLang ?? w.lang ?? w.subjectTtsLang,
          sortOrder: q.sortOrder,
        } satisfies QuestionSnapshot,
      })),
    )
    return row!.id
  })
  return getAttemptView(deps, childId, id)
}

export async function saveAnswers(deps: Deps, childId: string, attemptId: string, input: SaveAnswersInput) {
  let a = await loadAttempt(deps, childId, attemptId)
  a = await finalizeIfExpired(deps, a)
  if (a.submittedAt) {
    throw new HttpError(409, { error: a.autoSubmitted ? 'time_up' : 'already_submitted', message: 'Bài đã nộp' })
  }
  for (const ans of input.answers) {
    await deps.db
      .update(attemptAnswer)
      .set({ response: ans.response ?? null, timeMs: ans.timeMs ?? null, updatedAt: deps.clock() })
      .where(and(eq(attemptAnswer.id, ans.itemId), eq(attemptAnswer.attemptId, a.id)))
  }
}

export async function submitAttempt(deps: Deps, childId: string, attemptId: string): Promise<AttemptView> {
  const a = await loadAttempt(deps, childId, attemptId)
  if (a.submittedAt === null) await finalizeAttempt(deps, a.id, isExpired(deps, a))
  return getAttemptView(deps, childId, attemptId)
}

/** Chấm và khoá bài. Chỉ chạy đúng một lần cho mỗi lần làm, kể cả khi nộp song song. */
async function finalizeAttempt(deps: Deps, attemptId: string, auto: boolean) {
  const now = deps.clock()
  await deps.db.transaction(async (tx) => {
    const [a] = await tx.select().from(attempt).where(eq(attempt.id, attemptId))
    if (!a) return
    const submittedAt = auto && a.deadlineAt ? a.deadlineAt : now
    const claimed = await tx
      .update(attempt)
      .set({ submittedAt, autoSubmitted: auto })
      .where(and(eq(attempt.id, attemptId), isNull(attempt.submittedAt)))
      .returning({ id: attempt.id })
    if (claimed.length === 0) return

    const answers = await tx.select().from(attemptAnswer).where(eq(attemptAnswer.attemptId, attemptId))
    const scored: { score: number; points: number }[] = []
    for (const ans of answers) {
      const snap = ans.questionSnapshot as QuestionSnapshot
      const score = gradeQuestion(snap.body, ans.response)
      await tx
        .update(attemptAnswer)
        .set({ score, isCorrect: score === null ? null : score === 1 })
        .where(eq(attemptAnswer.id, ans.id))
      if (score !== null) scored.push({ score, points: snap.points })
    }
    const { total, earned, pct } = scorePercent(scored)

    const [fam] = await tx
      .select({ thresholds: family.starThresholds })
      .from(family)
      .innerJoin(child, eq(child.familyId, family.id))
      .where(eq(child.id, a.childId))
    const stars = starsFor(pct, fam?.thresholds ?? [50, 75, 90])

    await tx
      .update(attempt)
      .set({
        totalPoints: total,
        earnedPoints: earned,
        scorePct: pct,
        stars,
        durationSec: Math.round((submittedAt.getTime() - a.startedAt.getTime()) / 1000),
      })
      .where(eq(attempt.id, attemptId))

    // §5.1: mỗi bộ bài chỉ cộng phần chênh lệch so với số sao cao nhất từng đạt.
    if (a.kind === 'normal' && a.worksheetId && stars > 0) {
      const [prev] = (await tx
        .select({ best: max(attempt.stars) })
        .from(attempt)
        .where(
          and(
            eq(attempt.childId, a.childId),
            eq(attempt.worksheetId, a.worksheetId),
            isNotNull(attempt.submittedAt),
            ne(attempt.id, attemptId),
          ),
        )) as [{ best: number | null }]
      const delta = stars - (prev.best ?? 0)
      if (delta > 0) {
        await tx.insert(starLedger).values({ childId: a.childId, delta, reason: 'worksheet', refId: attemptId })
      }
    }
  })
}

export async function getAttemptView(deps: Deps, childId: string, attemptId: string): Promise<AttemptView> {
  const { db } = deps
  const a = await finalizeIfExpired(deps, await loadAttempt(deps, childId, attemptId))
  const [w] = a.worksheetId
    ? await db
        .select({ id: worksheet.id, title: worksheet.title, layout: worksheet.layout, subjectCode: subject.code })
        .from(worksheet)
        .innerJoin(subject, eq(subject.id, worksheet.subjectId))
        .where(eq(worksheet.id, a.worksheetId))
    : []

  const answers = (await db.select().from(attemptAnswer).where(eq(attemptAnswer.attemptId, a.id))).sort(
    (x, y) => (x.questionSnapshot as QuestionSnapshot).sortOrder - (y.questionSnapshot as QuestionSnapshot).sortOrder,
  )
  const submitted = a.submittedAt !== null

  let starsGained = 0
  if (submitted) {
    const [g] = await db
      .select({ sum: sql<number>`coalesce(sum(${starLedger.delta}), 0)::int` })
      .from(starLedger)
      .where(and(eq(starLedger.refId, a.id), eq(starLedger.childId, childId)))
    starsGained = Number(g?.sum ?? 0)
  }

  return {
    id: a.id,
    kind: a.kind,
    attemptNo: a.attemptNo,
    worksheet: w ?? null,
    startedAt: a.startedAt.toISOString(),
    deadlineAt: a.deadlineAt?.toISOString() ?? null,
    serverNow: deps.clock().toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
    autoSubmitted: a.autoSubmitted,
    items: answers.map((ans) => {
      const snap = ans.questionSnapshot as QuestionSnapshot
      return {
        id: ans.id,
        body: submitted ? (snap.body as never) : sanitizeForKid(snap.body, `${a.id}:${ans.id}`),
        points: snap.points,
        ttsLang: snap.ttsLang,
        response: ans.response,
      }
    }),
    result: submitted
      ? {
          scorePct: a.scorePct ?? 0,
          stars: a.stars ?? 0,
          starsGained,
          earnedPoints: a.earnedPoints ?? 0,
          totalPoints: a.totalPoints ?? 0,
          items: answers.map((ans) => {
            const snap = ans.questionSnapshot as QuestionSnapshot
            return { id: ans.id, body: snap.body, score: ans.score, isCorrect: ans.isCorrect, explanation: snap.explanation }
          }),
        }
      : null,
  }
}

/** Lịch sử làm bài của một bé (mới nhất trước), cho phụ huynh xem. */
export async function listChildAttempts(deps: Deps, familyId: string, childId: string, limit = 100): Promise<AttemptSummary[]> {
  const rows = await deps.db
    .select({
      id: attempt.id,
      worksheetId: attempt.worksheetId,
      worksheetTitle: worksheet.title,
      subjectCode: subject.code,
      attemptNo: attempt.attemptNo,
      kind: attempt.kind,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      durationSec: attempt.durationSec,
      scorePct: attempt.scorePct,
      stars: attempt.stars,
      autoSubmitted: attempt.autoSubmitted,
    })
    .from(attempt)
    .innerJoin(child, eq(child.id, attempt.childId))
    .leftJoin(worksheet, eq(worksheet.id, attempt.worksheetId))
    .leftJoin(subject, eq(subject.id, worksheet.subjectId))
    .where(and(eq(attempt.childId, childId), eq(child.familyId, familyId)))
    .orderBy(desc(attempt.startedAt))
    .limit(limit)
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    submittedAt: r.submittedAt?.toISOString() ?? null,
  }))
}

/** Điểm tốt nhất và số lần làm của từng bộ bài (cho thư viện của bé). */
export async function bestByWorksheet(deps: Deps, childId: string, worksheetIds: string[]) {
  if (worksheetIds.length === 0) return new Map<string, { bestScorePct: number | null; bestStars: number | null; attempts: number }>()
  const rows = await deps.db
    .select({
      worksheetId: attempt.worksheetId,
      bestScorePct: max(attempt.scorePct),
      bestStars: max(attempt.stars),
      attempts: sql<number>`count(*)::int`,
    })
    .from(attempt)
    .where(and(eq(attempt.childId, childId), isNotNull(attempt.submittedAt), inArray(attempt.worksheetId, worksheetIds)))
    .groupBy(attempt.worksheetId)
  return new Map(rows.map((r) => [r.worksheetId!, { bestScorePct: r.bestScorePct, bestStars: r.bestStars, attempts: Number(r.attempts) }]))
}
