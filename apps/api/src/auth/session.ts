import crypto from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { findActiveChild } from '../db/children.js'
import { family, parentUser, session } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError } from '../http.js'

export const SESSION_COOKIE = 'sid'
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000
// Còn dưới mốc này thì gia hạn lại đủ 90 ngày, để iPad không phải đăng nhập lại.
const SESSION_RENEW_BELOW_MS = 30 * 24 * 60 * 60 * 1000
export const PARENT_UNLOCK_MS = 15 * 60 * 1000

export type AuthContext = {
  sessionId: string
  parentUserId: string
  email: string
  familyId: string
  familyName: string
  activeChildId: string | null
  parentUnlockedUntil: Date | null
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export async function createSession(deps: Deps, reply: FastifyReply, parentUserId: string) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(deps.clock().getTime() + SESSION_TTL_MS)
  await deps.db.insert(session).values({ id: hashToken(token), parentUserId, expiresAt })
  setSessionCookie(deps, reply, token, expiresAt)
}

function setSessionCookie(deps: Deps, reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: deps.config.COOKIE_SECURE,
    expires: expiresAt,
  })
}

export async function destroySession(deps: Deps, req: FastifyRequest, reply: FastifyReply) {
  if (req.auth) await deps.db.delete(session).where(eq(session.id, req.auth.sessionId))
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** onRequest hook: đọc cookie, nạp phiên vào req.auth (null nếu chưa đăng nhập). */
export function loadSession(deps: Deps) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    req.auth = null
    // File tĩnh của web không cần phiên, khỏi tốn một lần truy vấn DB.
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/mcp')) return
    const token = req.cookies[SESSION_COOKIE]
    if (!token) return

    const now = deps.clock()
    const [row] = await deps.db
      .select({
        sessionId: session.id,
        parentUserId: session.parentUserId,
        email: parentUser.email,
        familyId: family.id,
        familyName: family.name,
        activeChildId: session.activeChildId,
        parentUnlockedUntil: session.parentUnlockedUntil,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .innerJoin(parentUser, eq(parentUser.id, session.parentUserId))
      .innerJoin(family, eq(family.id, parentUser.familyId))
      .where(and(eq(session.id, hashToken(token)), gt(session.expiresAt, now)))
    if (!row) return

    const { expiresAt, ...auth } = row
    req.auth = auth

    if (expiresAt.getTime() - now.getTime() < SESSION_RENEW_BELOW_MS) {
      const renewed = new Date(now.getTime() + SESSION_TTL_MS)
      await deps.db.update(session).set({ expiresAt: renewed }).where(eq(session.id, auth.sessionId))
      setSessionCookie(deps, reply, token, renewed)
    }
  }
}

export function requireSession(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new HttpError(401, { error: 'unauthenticated' })
  return req.auth
}

/** Khu phụ huynh: phải còn trong thời hạn mở khoá; mỗi lần gọi được gia hạn thêm 15 phút. */
export function requireParent(deps: Deps) {
  return async (req: FastifyRequest) => {
    const auth = requireSession(req)
    const now = deps.clock()
    if (!auth.parentUnlockedUntil || auth.parentUnlockedUntil <= now) {
      throw new HttpError(403, { error: 'parent_locked' })
    }
    const until = new Date(now.getTime() + PARENT_UNLOCK_MS)
    await deps.db.update(session).set({ parentUnlockedUntil: until }).where(eq(session.id, auth.sessionId))
    auth.parentUnlockedUntil = until
  }
}

/** API của bé: phải đã chọn một bé còn hoạt động trong gia đình. */
export function requireKid(deps: Deps) {
  return async (req: FastifyRequest) => {
    const auth = requireSession(req)
    const c = auth.activeChildId && (await findActiveChild(deps.db, auth.familyId, auth.activeChildId))
    if (!c) throw new HttpError(403, { error: 'no_child_selected' })
  }
}
