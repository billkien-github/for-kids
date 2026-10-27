import { AssignInput, CreateTokenInput, WorksheetInput, WorksheetPatch, type WorksheetStatus } from '@for-kids/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireParent, requireSession } from '../auth/session.js'
import { findActiveChild } from '../db/children.js'
import { attempt, child } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError, idParam, parse } from '../http.js'
import { assignWorksheet, cancelAssignment, listAssignments } from '../services/assignments.js'
import { getAttemptView, listChildAttempts } from '../services/attempts.js'
import { createToken, listTokens, revokeToken } from '../services/tokens.js'
import {
  createWorksheet,
  getCatalog,
  getWorksheetDetail,
  listWorksheets,
  setWorksheetStatus,
  updateWorksheet,
} from '../services/worksheets.js'

const WorksheetFilter = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  subject: z.string().optional(),
  grade: z.coerce.number().int().optional(),
})

/** Khu phụ huynh (§7): nội dung, giao bài, báo cáo, token MCP. Mọi route cần đã mở khoá bằng PIN. */
export function parentContentRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps
  const preHandler = requireParent(deps)
  const familyOf = (req: Parameters<typeof requireSession>[0]) => requireSession(req).familyId

  // ---------- Bài tập ----------

  app.get('/api/parent/catalog', { preHandler }, async (req) => getCatalog(db, familyOf(req)))

  app.get('/api/parent/worksheets', { preHandler }, async (req) => {
    const f = parse(WorksheetFilter, req.query)
    return listWorksheets(db, familyOf(req), { status: f.status, subjectCode: f.subject, grade: f.grade })
  })

  app.post('/api/parent/worksheets', { preHandler }, async (req, reply) => {
    const id = await createWorksheet(db, familyOf(req), parse(WorksheetInput, req.body), 'manual')
    reply.code(201)
    return getWorksheetDetail(db, familyOf(req), id)
  })

  app.get<{ Params: { id: string } }>('/api/parent/worksheets/:id', { preHandler }, async (req) =>
    getWorksheetDetail(db, familyOf(req), idParam(req.params.id)),
  )

  app.put<{ Params: { id: string } }>('/api/parent/worksheets/:id', { preHandler }, async (req) => {
    const id = idParam(req.params.id)
    await updateWorksheet(db, familyOf(req), id, parse(WorksheetPatch, req.body))
    return getWorksheetDetail(db, familyOf(req), id)
  })

  const statusRoute = (path: string, status: WorksheetStatus) =>
    app.post<{ Params: { id: string } }>(`/api/parent/worksheets/:id/${path}`, { preHandler }, async (req) => {
      await setWorksheetStatus(db, familyOf(req), idParam(req.params.id), status)
      return { ok: true }
    })
  statusRoute('publish', 'published')
  statusRoute('unpublish', 'draft')
  statusRoute('archive', 'archived')

  // ---------- Giao bài ----------

  app.get('/api/parent/assignments', { preHandler }, async (req) => {
    const q = parse(z.object({ childId: z.uuid().optional() }), req.query)
    return listAssignments(db, familyOf(req), { childId: q.childId, now: deps.clock() })
  })

  app.post('/api/parent/assignments', { preHandler }, async (req, reply) => {
    const ids = await assignWorksheet(db, familyOf(req), parse(AssignInput, req.body), 'parent', deps.clock())
    reply.code(201)
    return { ids }
  })

  app.delete<{ Params: { id: string } }>('/api/parent/assignments/:id', { preHandler }, async (req) => {
    await cancelAssignment(db, familyOf(req), idParam(req.params.id))
    return { ok: true }
  })

  // ---------- Kết quả ----------

  app.get<{ Params: { id: string } }>('/api/parent/children/:id/attempts', { preHandler }, async (req) => {
    const familyId = familyOf(req)
    const c = await findActiveChild(db, familyId, idParam(req.params.id))
    if (!c) throw new HttpError(404, { error: 'not_found' })
    return listChildAttempts(deps, familyId, c.id)
  })

  app.get<{ Params: { id: string } }>('/api/parent/attempts/:id', { preHandler }, async (req) => {
    const [a] = await db
      .select({ childId: attempt.childId })
      .from(attempt)
      .innerJoin(child, eq(child.id, attempt.childId))
      .where(and(eq(attempt.id, idParam(req.params.id)), eq(child.familyId, familyOf(req))))
    if (!a) throw new HttpError(404, { error: 'not_found' })
    return getAttemptView(deps, a.childId, idParam(req.params.id))
  })

  // ---------- Token MCP ----------

  app.get('/api/parent/tokens', { preHandler }, async (req) => listTokens(db, familyOf(req)))

  app.post('/api/parent/tokens', { preHandler }, async (req, reply) => {
    const input = parse(CreateTokenInput, req.body)
    reply.code(201)
    return createToken(db, familyOf(req), input.name, input.scopes)
  })

  app.delete<{ Params: { id: string } }>('/api/parent/tokens/:id', { preHandler }, async (req) => {
    await revokeToken(db, familyOf(req), idParam(req.params.id))
    return { ok: true }
  })
}
