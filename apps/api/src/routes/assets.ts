import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireParent, requireSession } from '../auth/session.js'
import { asset } from '../db/schema.js'
import type { Deps } from '../deps.js'
import { HttpError, idParam } from '../http.js'
import { MAX_ASSET_BYTES, saveImage } from '../services/assets.js'

export function assetRoutes(app: FastifyInstance, deps: Deps) {
  const { db } = deps

  // Tải ảnh lên: gửi thẳng nội dung file với Content-Type: image/*.
  app.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: MAX_ASSET_BYTES }, (_req, body, done) => done(null, body))

  app.post('/api/parent/assets', { preHandler: requireParent(deps), bodyLimit: MAX_ASSET_BYTES }, async (req, reply) => {
    const auth = requireSession(req)
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, { error: 'unsupported_asset', message: 'Gửi file ảnh với Content-Type image/*' })
    const saved = await saveImage(db, deps.storage, auth.familyId, req.body)
    reply.code(201)
    return { assetId: saved.id, mime: saved.mime, bytes: saved.bytes }
  })

  // Chỉ xem được ảnh của gia đình mình (bé và phụ huynh đều dùng).
  app.get<{ Params: { id: string } }>('/api/assets/:id', async (req, reply) => {
    const auth = requireSession(req)
    const [a] = await db
      .select()
      .from(asset)
      .where(and(eq(asset.id, idParam(req.params.id)), eq(asset.familyId, auth.familyId)))
    if (!a) throw new HttpError(404, { error: 'not_found' })
    const data = await deps.storage.get(a.storageKey)
    if (!data) throw new HttpError(404, { error: 'not_found' })
    // Nội dung theo sha256 nên không bao giờ đổi.
    return reply
      .header('content-type', a.mime)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(data)
  })
}
