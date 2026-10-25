import {
  computeStreak,
  localDate,
  MASTERY_INITIAL,
  MASTERY_MASTERED_FROM,
  MASTERY_MIN_ANSWERS,
  nextMastery,
  nextReview,
} from '@for-kids/shared'
import { and, count, eq, gt, gte, isNotNull, lte, notInArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { attempt, attemptAnswer, badge, child, childBadge, family, question, reviewItem, skillMastery, starLedger } from '../db/schema.js'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

/**
 * Khoá theo từng bé đến hết transaction: các thao tác ghi tiến độ / tạo lần làm / đổi quà của cùng
 * một bé chạy lần lượt (bấm hai lần, nộp trên hai máy cùng lúc…).
 */
export async function lockChild(tx: DbOrTx, childId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${childId}))`)
}

export async function familyTimezone(db: DbOrTx, childId: string): Promise<string> {
  const [f] = await db.select({ tz: family.timezone }).from(family).innerJoin(child, eq(child.familyId, family.id)).where(eq(child.id, childId))
  return f?.tz ?? 'Asia/Ho_Chi_Minh'
}

export type ScoredAnswer = { questionId: string | null; skillIds: string[]; score: number }

/**
 * Cập nhật mức thành thạo (§5.3) và hộp ôn câu sai (§5.4) sau khi chấm.
 * Mức thành thạo chỉ tính lần chính thức (attempt_no = 1) và phiên ôn.
 */
export async function applyProgress(
  tx: DbOrTx,
  a: { childId: string; kind: 'normal' | 'review'; attemptNo: number },
  answers: ScoredAnswer[],
  at: Date,
  today: string,
) {
  if (a.kind === 'review' || a.attemptNo === 1) {
    for (const ans of answers) {
      for (const skillId of ans.skillIds) {
        const [cur] = await tx
          .select()
          .from(skillMastery)
          .where(and(eq(skillMastery.childId, a.childId), eq(skillMastery.skillId, skillId)))
        const mastery = nextMastery(cur?.mastery ?? MASTERY_INITIAL, ans.score)
        const correct = ans.score === 1 ? 1 : 0
        if (cur) {
          await tx
            .update(skillMastery)
            .set({ mastery, answered: cur.answered + 1, correct: cur.correct + correct, lastSeenAt: at })
            .where(and(eq(skillMastery.childId, a.childId), eq(skillMastery.skillId, skillId)))
        } else {
          await tx.insert(skillMastery).values({ childId: a.childId, skillId, mastery, answered: 1, correct, lastSeenAt: at })
        }
      }
    }
  }

  for (const ans of answers) {
    // Câu đã bị xoá khỏi bài thì không ôn nữa.
    if (!ans.questionId) continue
    const correct = ans.score === 1
    const [cur] = await tx
      .select()
      .from(reviewItem)
      .where(and(eq(reviewItem.childId, a.childId), eq(reviewItem.questionId, ans.questionId)))
    const next = nextReview(cur ? { box: cur.box, dueOn: cur.dueOn } : null, correct, a.kind === 'review', today)
    if (next === null) {
      if (cur) await tx.delete(reviewItem).where(and(eq(reviewItem.childId, a.childId), eq(reviewItem.questionId, ans.questionId)))
      continue
    }
    if (cur) {
      await tx
        .update(reviewItem)
        .set({ box: next.box, dueOn: next.dueOn, wrongCount: cur.wrongCount + (correct ? 0 : 1), lastAnsweredAt: at })
        .where(and(eq(reviewItem.childId, a.childId), eq(reviewItem.questionId, ans.questionId)))
    } else {
      await tx.insert(reviewItem).values({
        childId: a.childId,
        questionId: ans.questionId,
        box: next.box,
        dueOn: next.dueOn,
        wrongCount: correct ? 0 : 1,
        lastAnsweredAt: at,
      })
    }
  }
}

/** Các ngày có ít nhất một lần nộp bài (kể cả phiên ôn), theo múi giờ gia đình. */
export async function studyDays(db: DbOrTx, childId: string, tz: string, since: Date): Promise<string[]> {
  const rows = await db
    .select({ submittedAt: attempt.submittedAt })
    .from(attempt)
    .where(and(eq(attempt.childId, childId), isNotNull(attempt.submittedAt), gte(attempt.submittedAt, since)))
  return [...new Set(rows.map((r) => localDate(r.submittedAt!, tz)))]
}

/** `tz` có thể truyền sẵn để khỏi tra lại múi giờ của gia đình. */
export async function streakFor(db: DbOrTx, childId: string, now: Date, tz?: string): Promise<number> {
  const zone = tz ?? (await familyTimezone(db, childId))
  // Đủ dài cho chuỗi một năm; chuỗi dài hơn vẫn đúng tới mốc này.
  const days = await studyDays(db, childId, zone, new Date(now.getTime() - 400 * 24 * 3600 * 1000))
  return computeStreak(days, localDate(now, zone))
}

export async function reviewDueCount(db: DbOrTx, childId: string, now: Date, tz?: string): Promise<number> {
  const today = localDate(now, tz ?? (await familyTimezone(db, childId)))
  const [r] = await db
    .select({ n: count() })
    .from(reviewItem)
    .innerJoin(question, eq(question.id, reviewItem.questionId))
    .where(and(eq(reviewItem.childId, childId), lte(reviewItem.dueOn, today)))
  return Number(r?.n ?? 0)
}

type BadgeRule =
  | { type: 'worksheets_submitted'; count: number }
  | { type: 'perfect_scores'; count: number }
  | { type: 'streak'; days: number }
  | { type: 'skills_mastered'; count: number }
  | { type: 'review_correct'; count: number }

/**
 * Xét huy hiệu sau mỗi lần nộp (§5.5). Huy hiệu mới gắn với lần làm bài,
 * sao thưởng ghi vào sổ sao (ref_id = lần làm bài).
 */
export async function awardBadges(tx: DbOrTx, childId: string, attemptId: string, at: Date) {
  const earned = await tx.select({ badgeId: childBadge.badgeId }).from(childBadge).where(eq(childBadge.childId, childId))
  const candidates = await tx
    .select()
    .from(badge)
    .where(earned.length ? notInArray(badge.id, earned.map((e) => e.badgeId)) : undefined)
  if (candidates.length === 0) return []

  const memo = new Map<string, Promise<number>>()
  const metric = (key: string, compute: () => Promise<number>) => {
    if (!memo.has(key)) memo.set(key, compute())
    return memo.get(key)!
  }
  const counter = async (q: PromiseLike<{ n: number }[]>) => Number((await q)[0]?.n ?? 0)

  const value = (rule: BadgeRule): Promise<number> => {
    switch (rule.type) {
      case 'worksheets_submitted':
        return metric(rule.type, () =>
          counter(
            tx
              .select({ n: count() })
              .from(attempt)
              .where(and(eq(attempt.childId, childId), eq(attempt.kind, 'normal'), isNotNull(attempt.submittedAt))),
          ),
        )
      case 'perfect_scores':
        return metric(rule.type, () =>
          counter(
            tx
              .select({ n: count() })
              .from(attempt)
              // Bài không có câu nào để chấm (chỉ thẻ bài học) không tính là điểm tuyệt đối.
              .where(and(eq(attempt.childId, childId), eq(attempt.kind, 'normal'), gte(attempt.scorePct, 100), gt(attempt.totalPoints, 0))),
          ),
        )
      case 'streak':
        return metric(rule.type, () => streakFor(tx, childId, at))
      case 'skills_mastered':
        return metric(rule.type, () =>
          counter(
            tx
              .select({ n: count() })
              .from(skillMastery)
              .where(
                and(
                  eq(skillMastery.childId, childId),
                  gte(skillMastery.mastery, MASTERY_MASTERED_FROM),
                  gte(skillMastery.answered, MASTERY_MIN_ANSWERS),
                ),
              ),
          ),
        )
      case 'review_correct':
        return metric(rule.type, () =>
          counter(
            tx
              .select({ n: count() })
              .from(attemptAnswer)
              .innerJoin(attempt, eq(attempt.id, attemptAnswer.attemptId))
              .where(and(eq(attempt.childId, childId), eq(attempt.kind, 'review'), eq(attemptAnswer.isCorrect, true))),
          ),
        )
    }
  }
  const threshold = (rule: BadgeRule) => ('days' in rule ? rule.days : rule.count)

  const won: (typeof candidates)[number][] = []
  for (const b of candidates) {
    const rule = b.rule as BadgeRule
    if ((await value(rule)) >= threshold(rule)) won.push(b)
  }
  const awarded: typeof won = []
  for (const b of won) {
    const inserted = await tx
      .insert(childBadge)
      .values({ childId, badgeId: b.id, earnedAt: at, attemptId })
      .onConflictDoNothing()
      .returning({ badgeId: childBadge.badgeId })
    // Chỉ thưởng sao khi huy hiệu thật sự vừa được thêm.
    if (inserted.length === 0) continue
    awarded.push(b)
    if (b.bonusStars > 0) {
      await tx.insert(starLedger).values({ childId, delta: b.bonusStars, reason: 'badge', refId: attemptId, note: `${b.icon} ${b.name}` })
    }
  }
  return awarded.map((b) => ({ code: b.code, name: b.name, icon: b.icon }))
}

/** Huy hiệu bé đạt được nhờ lần làm bài này. */
export async function badgesFromAttempt(db: DbOrTx, childId: string, attemptId: string) {
  return db
    .select({ code: badge.code, name: badge.name, icon: badge.icon })
    .from(childBadge)
    .innerJoin(badge, eq(badge.id, childBadge.badgeId))
    .where(and(eq(childBadge.childId, childId), eq(childBadge.attemptId, attemptId)))
}

export async function starBalance(db: DbOrTx, childId: string): Promise<number> {
  const [r] = await db
    .select({ stars: sql<number>`coalesce(sum(${starLedger.delta}), 0)::int` })
    .from(starLedger)
    .where(eq(starLedger.childId, childId))
  return Number(r?.stars ?? 0)
}
