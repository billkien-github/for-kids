import { hash } from '@node-rs/argon2'
import { ChildInput, type Profile } from '@for-kids/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireParent, requireSession } from '../auth/session.js'
import { findActiveChild, listActiveChildren } from '../db/children.js'
import { child, session } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError, idParam, parse } from '../http.js'
import { toProfile } from './auth.js'

// Hồ sơ các bé (§6 phụ huynh, mục 5).
export function parentChildrenRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps
  const preHandler = requireParent(deps)

  const findChild = async (familyId: string, id: string) => {
    const c = await findActiveChild(db, familyId, idParam(id))
    if (!c) throw new HttpError(404, { error: 'not_found' })
    return c
  }

  app.get('/api/parent/children', { preHandler }, async (req): Promise<Profile[]> => {
    const auth = requireSession(req)
    return (await listActiveChildren(db, auth.familyId)).map(toProfile)
  })

  app.post('/api/parent/children', { preHandler }, async (req, reply): Promise<Profile> => {
    const auth = requireSession(req)
    const input = parse(ChildInput, req.body)
    const [c] = await db
      .insert(child)
      .values({
        familyId: auth.familyId,
        name: input.name,
        avatar: input.avatar,
        grade: input.grade,
        pinHash: input.pin ? await hash(input.pin) : null,
      })
      .returning()
    reply.code(201)
    return toProfile(c!)
  })

  app.put<{ Params: { id: string } }>('/api/parent/children/:id', { preHandler }, async (req): Promise<Profile> => {
    const auth = requireSession(req)
    const existing = await findChild(auth.familyId, req.params.id)
    const input = parse(ChildInput, req.body)
    const pinHash = input.pin === undefined ? existing.pinHash : input.pin === null ? null : await hash(input.pin)
    const [c] = await db
      .update(child)
      .set({ name: input.name, avatar: input.avatar, grade: input.grade, pinHash })
      .where(eq(child.id, existing.id))
      .returning()
    return toProfile(c!)
  })

  // Lưu trữ thay vì xoá, để giữ lịch sử làm bài.
  app.delete<{ Params: { id: string } }>('/api/parent/children/:id', { preHandler }, async (req) => {
    const auth = requireSession(req)
    const existing = await findChild(auth.familyId, req.params.id)
    await db.update(child).set({ archivedAt: deps.clock() }).where(eq(child.id, existing.id))
    await db.update(session).set({ activeChildId: null }).where(eq(session.activeChildId, existing.id))
    return { ok: true }
  })
}
