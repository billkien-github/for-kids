import { hash, verify } from '@node-rs/argon2'
import {
  ChangePasswordInput,
  ChangePinInput,
  RewardInput,
  StarThresholdsInput,
  type FamilySettings,
  type McpAuditEntry,
} from '@for-kids/shared'
import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireParent, requireSession } from '../auth/session.js'
import { apiToken, family, mcpAudit, parentUser } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError, idParam, parse } from '../http.js'
import { childMistakes, childReport } from '../services/report.js'
import { createReward, decideRedemption, listRedemptions, listRewards, updateReward } from '../services/rewards.js'

/** Khu phụ huynh: báo cáo, quà, cài đặt, nhật ký MCP (§6, §7). */
export function parentSettingsRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps
  const preHandler = requireParent(deps)

  // ---------- Báo cáo ----------

  app.get<{ Params: { id: string } }>('/api/parent/children/:id/report', { preHandler }, async (req) => {
    const q = parse(z.object({ from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }), req.query)
    return childReport(deps, requireSession(req).familyId, idParam(req.params.id), {
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    })
  })

  app.get<{ Params: { id: string } }>('/api/parent/children/:id/mistakes', { preHandler }, async (req) =>
    childMistakes(deps, requireSession(req).familyId, idParam(req.params.id)),
  )

  // ---------- Quà ----------

  app.get('/api/parent/rewards', { preHandler }, async (req) => listRewards(db, requireSession(req).familyId))

  app.post('/api/parent/rewards', { preHandler }, async (req, reply) => {
    reply.code(201)
    return createReward(db, requireSession(req).familyId, parse(RewardInput, req.body))
  })

  app.put<{ Params: { id: string } }>('/api/parent/rewards/:id', { preHandler }, async (req) =>
    updateReward(db, requireSession(req).familyId, idParam(req.params.id), parse(RewardInput, req.body)),
  )

  app.get('/api/parent/redemptions', { preHandler }, async (req) => {
    const q = parse(z.object({ status: z.literal('pending').optional() }), req.query)
    return listRedemptions(db, requireSession(req).familyId, { status: q.status })
  })

  for (const [action, approve] of [
    ['approve', true],
    ['reject', false],
  ] as const) {
    app.post<{ Params: { id: string } }>(`/api/parent/redemptions/:id/${action}`, { preHandler }, async (req) => {
      await decideRedemption(deps, requireSession(req).familyId, idParam(req.params.id), approve)
      return { ok: true }
    })
  }

  // ---------- Cài đặt ----------

  app.get('/api/parent/settings', { preHandler }, async (req): Promise<FamilySettings> => {
    const [f] = await db.select().from(family).where(eq(family.id, requireSession(req).familyId))
    return { name: f!.name, starThresholds: f!.starThresholds as [number, number, number] }
  })

  app.put('/api/parent/settings/star-thresholds', { preHandler }, async (req) => {
    const { thresholds } = parse(StarThresholdsInput, req.body)
    await db.update(family).set({ starThresholds: thresholds }).where(eq(family.id, requireSession(req).familyId))
    return { ok: true }
  })

  app.put('/api/parent/settings/pin', { preHandler }, async (req) => {
    const auth = requireSession(req)
    const input = parse(ChangePinInput, req.body)
    const key = `parent:${auth.parentUserId}`
    deps.limits.pin.hit(key)
    const [u] = await db.select().from(parentUser).where(eq(parentUser.id, auth.parentUserId))
    if (!u || !(await verify(u.parentPinHash, input.currentPin))) {
      throw new HttpError(401, { error: 'wrong_pin', message: 'PIN hiện tại chưa đúng' })
    }
    deps.limits.pin.reset(key)
    await db.update(parentUser).set({ parentPinHash: await hash(input.newPin) }).where(eq(parentUser.id, u.id))
    return { ok: true }
  })

  app.put('/api/parent/settings/password', { preHandler }, async (req) => {
    const auth = requireSession(req)
    const input = parse(ChangePasswordInput, req.body)
    const key = `password:${auth.parentUserId}`
    deps.limits.login.hit(key)
    const [u] = await db.select().from(parentUser).where(eq(parentUser.id, auth.parentUserId))
    if (!u || !(await verify(u.passwordHash, input.currentPassword))) {
      throw new HttpError(401, { error: 'wrong_password', message: 'Mật khẩu hiện tại chưa đúng' })
    }
    deps.limits.login.reset(key)
    await db.update(parentUser).set({ passwordHash: await hash(input.newPassword) }).where(eq(parentUser.id, u.id))
    return { ok: true }
  })

  // ---------- Nhật ký MCP (P3) ----------

  app.get('/api/parent/mcp-audit', { preHandler }, async (req): Promise<McpAuditEntry[]> => {
    const rows = await db
      .select({ a: mcpAudit, tokenName: apiToken.name })
      .from(mcpAudit)
      .innerJoin(apiToken, eq(apiToken.id, mcpAudit.tokenId))
      .where(eq(apiToken.familyId, requireSession(req).familyId))
      .orderBy(desc(mcpAudit.createdAt))
      .limit(200)
    return rows.map(({ a, tokenName }) => ({
      id: a.id,
      tokenName,
      tool: a.tool,
      argsSummary: a.argsSummary,
      ok: a.ok,
      createdAt: a.createdAt.toISOString(),
    }))
  })
}
