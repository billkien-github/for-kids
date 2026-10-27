import { randomUUID } from 'node:crypto'
import {
  expandArithGen,
  gradeQuestion,
  localDate,
  REVIEW_SESSION_SIZE,
  REVIEW_SESSION_STARS,
  sanitizeForKid,
  scorePercent,
  starsFor,
  TIME_LIMIT_GRACE_SEC,
  type AttemptSummary,
  type AttemptView,
  type QuestionBody,
  type SaveAnswersInput,
} from '@for-kids/shared'
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, max, ne, sql } from 'drizzle-orm'
import {
  assignment,
  attempt,
  attemptAnswer,
  child,
  family,
  question,
  questionSkill,
  reviewItem,
  starLedger,
  subject,
  worksheet,
} from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError } from '../http.js'
import { applyProgress, awardBadges, badgesFromAttempt, familyTimezone, lockChild, type DbOrTx } from './progress.js'

/** Bản chụp câu hỏi lúc bắt đầu làm (§3): sửa bài sau đó không làm sai lịch sử. */
export type QuestionSnapshot = {
  body: QuestionBody
  explanation: string | null
  points: number
  ttsLang: string
  sortOrder: number
  /** Kỹ năng gắn với câu lúc làm, để cập nhật mức thành thạo. Bản chụp cũ có thể thiếu. */
  skillIds?: string[]
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

/** Bản chụp cho một danh sách câu hỏi, giữ nguyên thứ tự truyền vào. */
async function snapshotsFor(
  db: DbOrTx,
  qs: { id: string; body: QuestionBody; explanation: string | null; points: number; ttsLang: string | null; fallbackLang: string }[],
) {
  const links = qs.length
    ? await db
        .select()
        .from(questionSkill)
        .where(
          inArray(
            questionSkill.questionId,
            qs.map((q) => q.id),
          ),
        )
    : []
  const out: { questionId: string | null; questionSnapshot: QuestionSnapshot }[] = []
  for (const q of qs) {
    const common = { points: q.points, ttsLang: q.ttsLang ?? q.fallbackLang, skillIds: links.filter((l) => l.questionId === q.id).map((l) => l.skillId) }
    if (q.body.type === 'arith_gen') {
      // Bài tự sinh: mỗi lần làm một bộ phép tính mới. Câu sinh ra không gắn questionId (mỗi câu gốc chỉ có
      // một dòng trả lời trong một lần làm), nên không vào hàng đợi ôn; mức thành thạo kỹ năng vẫn được tính.
      for (const g of expandArithGen(q.body, randomUUID())) {
        out.push({ questionId: null, questionSnapshot: { ...common, body: g.body, explanation: g.explanation, sortOrder: out.length } })
      }
      continue
    }
    out.push({ questionId: q.id, questionSnapshot: { ...common, body: q.body, explanation: q.explanation, sortOrder: out.length } })
  }
  return out
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
  const snaps = await snapshotsFor(
    db,
    qs.map((q) => ({ ...q, fallbackLang: w.lang ?? w.subjectTtsLang })),
  )

  const now = deps.clock()
  const id = await db.transaction(async (tx) => {
    // Bấm mở bài hai lần cùng lúc: lần sau thấy lần làm vừa tạo và dùng lại.
    await lockChild(tx, childId)
    const [raced] = await tx
      .select({ id: attempt.id })
      .from(attempt)
      .where(and(eq(attempt.childId, childId), eq(attempt.worksheetId, w.id), eq(attempt.kind, 'normal'), isNull(attempt.submittedAt)))
    if (raced) return raced.id

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
    await tx.insert(attemptAnswer).values(snaps.map((s) => ({ attemptId: row!.id, ...s })))
    return row!.id
  })
  return getAttemptView(deps, childId, id)
}

/**
 * Phiên ôn tập (§5.4): tối đa 10 câu đến hạn, ưu tiên hạn sớm và hộp thấp. Đang có phiên dở thì làm tiếp.
 * Không giới hạn thời gian.
 */
export async function startReview(deps: Deps, familyId: string, childId: string): Promise<AttemptView> {
  const { db } = deps
  const [open] = await db
    .select({ id: attempt.id })
    .from(attempt)
    .where(and(eq(attempt.childId, childId), eq(attempt.kind, 'review'), isNull(attempt.submittedAt)))
  if (open) return getAttemptView(deps, childId, open.id)

  const today = localDate(deps.clock(), await familyTimezone(db, childId))
  const due = await db
    .select({
      id: question.id,
      body: question.body,
      explanation: question.explanation,
      points: question.points,
      ttsLang: question.ttsLang,
      fallbackLang: sql<string>`coalesce(${worksheet.lang}, ${subject.ttsLang})`,
    })
    .from(reviewItem)
    .innerJoin(question, eq(question.id, reviewItem.questionId))
    .innerJoin(worksheet, eq(worksheet.id, question.worksheetId))
    .innerJoin(subject, eq(subject.id, worksheet.subjectId))
    .where(and(eq(reviewItem.childId, childId), eq(worksheet.familyId, familyId), lte(reviewItem.dueOn, today)))
    .orderBy(asc(reviewItem.dueOn), asc(reviewItem.box))
    .limit(REVIEW_SESSION_SIZE)
  if (due.length === 0) throw new HttpError(409, { error: 'nothing_to_review', message: 'Hôm nay con không có câu nào cần ôn. Giỏi lắm! 🎉' })

  const snaps = await snapshotsFor(db, due)
  const id = await db.transaction(async (tx) => {
    // Bấm "Ôn tập" hai lần cùng lúc chỉ tạo một phiên.
    await lockChild(tx, childId)
    const [raced] = await tx
      .select({ id: attempt.id })
      .from(attempt)
      .where(and(eq(attempt.childId, childId), eq(attempt.kind, 'review'), isNull(attempt.submittedAt)))
    if (raced) return raced.id

    const [{ n }] = (await tx
      .select({ n: count() })
      .from(attempt)
      .where(and(eq(attempt.childId, childId), eq(attempt.kind, 'review')))) as [{ n: number }]
    const [row] = await tx
      .insert(attempt)
      .values({ childId, worksheetId: null, kind: 'review', attemptNo: Number(n) + 1, startedAt: deps.clock() })
      .returning({ id: attempt.id })
    await tx.insert(attemptAnswer).values(snaps.map((s) => ({ attemptId: row!.id, ...s })))
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
    // Các lần nộp của cùng một bé chạy lần lượt: tiến độ, hộp ôn, huy hiệu không bị ghi chồng.
    await lockChild(tx, a.childId)
    const submittedAt = auto && a.deadlineAt ? a.deadlineAt : now
    const claimed = await tx
      .update(attempt)
      .set({ submittedAt, autoSubmitted: auto })
      .where(and(eq(attempt.id, attemptId), isNull(attempt.submittedAt)))
      .returning({ id: attempt.id })
    if (claimed.length === 0) return

    const answers = await tx.select().from(attemptAnswer).where(eq(attemptAnswer.attemptId, attemptId))
    const scored: { score: number; points: number }[] = []
    const progress: { questionId: string | null; skillIds: string[]; score: number }[] = []
    for (const ans of answers) {
      const snap = ans.questionSnapshot as QuestionSnapshot
      const score = gradeQuestion(snap.body, ans.response)
      await tx
        .update(attemptAnswer)
        .set({ score, isCorrect: score === null ? null : score === 1 })
        .where(eq(attemptAnswer.id, ans.id))
      if (score !== null) {
        scored.push({ score, points: snap.points })
        progress.push({ questionId: ans.questionId, skillIds: snap.skillIds ?? [], score })
      }
    }
    const { total, earned, pct } = scorePercent(scored)

    const [fam] = await tx
      .select({ thresholds: family.starThresholds, tz: family.timezone })
      .from(family)
      .innerJoin(child, eq(child.familyId, family.id))
      .where(eq(child.id, a.childId))
    // Bài không có câu nào để chấm (chỉ thẻ bài học) thì không có sao.
    const stars = total > 0 ? starsFor(pct, fam?.thresholds ?? [50, 75, 90]) : 0

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

    if (a.kind === 'review') {
      // §5.4: làm xong phiên ôn được +1 sao.
      await tx.insert(starLedger).values({ childId: a.childId, delta: REVIEW_SESSION_STARS, reason: 'review', refId: attemptId, note: 'Ôn tập' })
    } else if (a.worksheetId && stars > 0) {
      // §5.1: mỗi bộ bài chỉ cộng phần chênh lệch so với số sao cao nhất từng đạt.
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
        const [w] = await tx.select({ title: worksheet.title }).from(worksheet).where(eq(worksheet.id, a.worksheetId))
        await tx.insert(starLedger).values({ childId: a.childId, delta, reason: 'worksheet', refId: attemptId, note: w?.title ?? null })
      }
    }

    await applyProgress(tx, a, progress, submittedAt, localDate(submittedAt, fam?.tz ?? 'Asia/Ho_Chi_Minh'))
    await awardBadges(tx, a.childId, attemptId, submittedAt)
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
  let newBadges: { code: string; name: string; icon: string }[] = []
  if (submitted) {
    const [g] = await db
      .select({ sum: sql<number>`coalesce(sum(${starLedger.delta}), 0)::int` })
      .from(starLedger)
      .where(and(eq(starLedger.refId, a.id), eq(starLedger.childId, childId)))
    starsGained = Number(g?.sum ?? 0)
    newBadges = await badgesFromAttempt(db, childId, a.id)
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
          newBadges,
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
