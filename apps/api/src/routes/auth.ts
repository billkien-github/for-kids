import { hash, verify } from '@node-rs/argon2'
import { LoginInput, PinInput, SelectProfileInput, type Me, type Profile } from '@for-kids/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { createSession, destroySession, PARENT_UNLOCK_MS, requireSession } from '../auth/session.js'
import { findActiveChild, listActiveChildren } from '../db/children.js'
import { child, parentUser, session } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError, idParam, parse } from '../http.js'

// Băm giả để thời gian trả lời như nhau dù email có tồn tại hay không.
let dummyHash: Promise<string> | undefined
const getDummyHash = () => (dummyHash ??= hash('dummy-password-for-timing'))

export const toProfile = (c: typeof child.$inferSelect): Profile => ({
  id: c.id,
  name: c.name,
  avatar: c.avatar,
  grade: c.grade,
  hasPin: c.pinHash !== null,
})

export function authRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps

  app.post('/api/auth/login', async (req, reply) => {
    const input = parse(LoginInput, req.body)
    const key = `login:${req.ip}:${input.email}`
    deps.limits.login.hit(key)

    const [user] = await db.select().from(parentUser).where(eq(parentUser.email, input.email))
    const ok = await verify(user?.passwordHash ?? (await getDummyHash()), input.password)
    if (!user || !ok) {
      throw new HttpError(401, { error: 'invalid_credentials', message: 'Email hoặc mật khẩu không đúng' })
    }
    deps.limits.login.reset(key)
    await createSession(deps, reply, user.id)
    return { ok: true }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(deps, req, reply)
    return { ok: true }
  })

  app.get('/api/auth/me', async (req): Promise<Me> => {
    const auth = requireSession(req)
    const active = auth.activeChildId ? await findActiveChild(db, auth.familyId, auth.activeChildId) : undefined
    const unlocked = auth.parentUnlockedUntil && auth.parentUnlockedUntil > deps.clock() ? auth.parentUnlockedUntil : null
    return {
      parent: { id: auth.parentUserId, email: auth.email },
      family: { id: auth.familyId, name: auth.familyName },
      activeChild: active ? toProfile(active) : null,
      parentUnlockedUntil: unlocked?.toISOString() ?? null,
    }
  })

  app.get('/api/profiles', async (req): Promise<Profile[]> => {
    const auth = requireSession(req)
    return (await listActiveChildren(db, auth.familyId)).map(toProfile)
  })

  app.post<{ Params: { childId: string } }>('/api/profiles/:childId/select', async (req) => {
    const auth = requireSession(req)
    const { pin } = parse(SelectProfileInput, req.body)
    const c = await findActiveChild(db, auth.familyId, idParam(req.params.childId))
    if (!c) throw new HttpError(404, { error: 'not_found' })

    if (c.pinHash) {
      const key = `child:${c.id}`
      deps.limits.pin.hit(key)
      if (!pin || !(await verify(c.pinHash, pin))) {
        throw new HttpError(401, { error: 'wrong_pin', message: 'Mã PIN chưa đúng, thử lại nhé' })
      }
      deps.limits.pin.reset(key)
    }

    // Bé cầm máy thì khoá luôn khu phụ huynh.
    await db
      .update(session)
      .set({ activeChildId: c.id, parentUnlockedUntil: null })
      .where(eq(session.id, auth.sessionId))
    return toProfile(c)
  })

  app.post('/api/parent/unlock', async (req) => {
    const auth = requireSession(req)
    const { pin } = parse(PinInput, req.body)
    const key = `parent:${auth.parentUserId}`
    deps.limits.pin.hit(key)

    const [user] = await db.select().from(parentUser).where(eq(parentUser.id, auth.parentUserId))
    if (!user || !(await verify(user.parentPinHash, pin))) {
      throw new HttpError(401, { error: 'wrong_pin', message: 'Mã PIN chưa đúng, thử lại nhé' })
    }
    deps.limits.pin.reset(key)

    const until = new Date(deps.clock().getTime() + PARENT_UNLOCK_MS)
    await db.update(session).set({ parentUnlockedUntil: until }).where(eq(session.id, auth.sessionId))
    return { parentUnlockedUntil: until.toISOString() }
  })

  app.post('/api/parent/lock', async (req) => {
    const auth = requireSession(req)
    await db.update(session).set({ parentUnlockedUntil: null }).where(eq(session.id, auth.sessionId))
    return { ok: true }
  })
}
