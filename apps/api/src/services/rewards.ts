import type { Achievements, BadgeView, LedgerEntry, RedemptionView, RewardInput, RewardView } from '@for-kids/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { badge, child, childBadge, reward, rewardRedemption, starLedger } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError } from '../http.js'
import { lockChild, starBalance, streakFor, type DbOrTx } from './progress.js'

const toReward = (r: typeof reward.$inferSelect): RewardView => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  costStars: r.costStars,
  active: r.active,
})

export async function listRewards(db: Db, familyId: string, onlyActive = false) {
  const rows = await db
    .select()
    .from(reward)
    .where(and(eq(reward.familyId, familyId), onlyActive ? eq(reward.active, true) : undefined))
    .orderBy(asc(reward.costStars))
  return rows.map(toReward)
}

export async function createReward(db: Db, familyId: string, input: RewardInput) {
  const [r] = await db.insert(reward).values({ familyId, ...input }).returning()
  return toReward(r!)
}

export async function updateReward(db: Db, familyId: string, id: string, input: RewardInput) {
  const [r] = await db
    .update(reward)
    .set(input)
    .where(and(eq(reward.id, id), eq(reward.familyId, familyId)))
    .returning()
  if (!r) throw new HttpError(404, { error: 'not_found' })
  return toReward(r)
}

async function pendingCost(db: DbOrTx, childId: string) {
  const [r] = await db
    .select({ cost: sql<number>`coalesce(sum(${rewardRedemption.costStars}), 0)::int` })
    .from(rewardRedemption)
    .where(and(eq(rewardRedemption.childId, childId), eq(rewardRedemption.status, 'pending')))
  return Number(r?.cost ?? 0)
}

export async function listRedemptions(db: Db, familyId: string, opts: { childId?: string; status?: 'pending' } = {}): Promise<RedemptionView[]> {
  const rows = await db
    .select({ r: rewardRedemption, reward, child })
    .from(rewardRedemption)
    .innerJoin(reward, eq(reward.id, rewardRedemption.rewardId))
    .innerJoin(child, eq(child.id, rewardRedemption.childId))
    .where(
      and(
        eq(child.familyId, familyId),
        opts.childId ? eq(rewardRedemption.childId, opts.childId) : undefined,
        opts.status ? eq(rewardRedemption.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(rewardRedemption.createdAt))
    .limit(100)
  return rows.map(({ r, reward: rw, child: c }) => ({
    id: r.id,
    reward: { id: rw.id, name: rw.name, icon: rw.icon },
    child: { id: c.id, name: c.name, avatar: c.avatar },
    costStars: r.costStars,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }))
}

/** §5.6: bé không đổi được quà vượt quá số sao đang có (tính cả các yêu cầu đang chờ duyệt). */
export async function redeemReward(deps: Deps, familyId: string, childId: string, rewardId: string) {
  const { db } = deps
  const [rw] = await db
    .select()
    .from(reward)
    .where(and(eq(reward.id, rewardId), eq(reward.familyId, familyId), eq(reward.active, true)))
  if (!rw) throw new HttpError(404, { error: 'not_found' })
  return db.transaction(async (tx) => {
    // Khoá theo bé để hai lần bấm đổi cùng lúc không cùng lọt qua kiểm tra số dư.
    await lockChild(tx, childId)
    const available = (await starBalance(tx, childId)) - (await pendingCost(tx, childId))
    if (available < rw.costStars) {
      throw new HttpError(409, { error: 'not_enough_stars', message: `Con cần ${rw.costStars} ⭐, hiện có ${available} ⭐` })
    }
    const [r] = await tx.insert(rewardRedemption).values({ childId, rewardId, costStars: rw.costStars }).returning({ id: rewardRedemption.id })
    return r!.id
  })
}

export async function decideRedemption(deps: Deps, familyId: string, id: string, approve: boolean) {
  const { db } = deps
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ r: rewardRedemption, rewardName: reward.name, rewardIcon: reward.icon })
      .from(rewardRedemption)
      .innerJoin(child, eq(child.id, rewardRedemption.childId))
      .innerJoin(reward, eq(reward.id, rewardRedemption.rewardId))
      .where(and(eq(rewardRedemption.id, id), eq(child.familyId, familyId)))
    if (!row) throw new HttpError(404, { error: 'not_found' })
    const claimed = await tx
      .update(rewardRedemption)
      .set({ status: approve ? 'approved' : 'rejected', decidedAt: deps.clock() })
      .where(and(eq(rewardRedemption.id, id), eq(rewardRedemption.status, 'pending')))
      .returning({ id: rewardRedemption.id })
    if (claimed.length === 0) throw new HttpError(409, { error: 'already_decided', message: 'Yêu cầu đã được xử lý' })
    if (approve) {
      await tx.insert(starLedger).values({
        childId: row.r.childId,
        delta: -row.r.costStars,
        reason: 'redeem',
        refId: id,
        note: `${row.rewardIcon} ${row.rewardName}`,
      })
    }
  })
}

export async function achievements(deps: Deps, familyId: string, childId: string): Promise<Achievements> {
  const { db } = deps
  const earned = await db.select().from(childBadge).where(eq(childBadge.childId, childId))
  const badges: BadgeView[] = (await db.select().from(badge).orderBy(asc(badge.bonusStars))).map((b) => ({
    code: b.code,
    name: b.name,
    icon: b.icon,
    bonusStars: b.bonusStars,
    earnedAt: earned.find((e) => e.badgeId === b.id)?.earnedAt.toISOString() ?? null,
  }))
  const history: LedgerEntry[] = (
    await db.select().from(starLedger).where(eq(starLedger.childId, childId)).orderBy(desc(starLedger.createdAt)).limit(50)
  ).map((l) => ({ id: l.id, delta: l.delta, reason: l.reason, note: l.note, createdAt: l.createdAt.toISOString() }))
  const stars = await starBalance(db, childId)
  return {
    stars,
    available: stars - (await pendingCost(db, childId)),
    streak: await streakFor(db, childId, deps.clock()),
    badges,
    history,
    rewards: await listRewards(db, familyId, true),
    redemptions: await listRedemptions(db, familyId, { childId }),
  }
}
