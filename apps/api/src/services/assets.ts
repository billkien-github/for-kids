import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { asset } from '../db/schema.js'
import { HttpError } from '../http.js'
import type { Storage } from './storage.js'

export const MAX_ASSET_BYTES = 10 * 1024 * 1024

// Chỉ nhận ảnh raster. Không nhận SVG vì có thể chứa script khi mở cùng origin.
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
]

/** Lưu ảnh, khử trùng lặp theo sha256 trong từng gia đình. Định dạng xác định theo nội dung file, không tin `mime` gửi lên. */
export async function saveImage(db: Db, storage: Storage, familyId: string, data: Buffer) {
  if (data.length === 0) throw new HttpError(400, { error: 'invalid_asset', message: 'File rỗng' })
  if (data.length > MAX_ASSET_BYTES) throw new HttpError(413, { error: 'asset_too_large', message: 'Ảnh tối đa 10MB' })
  const kind = SIGNATURES.find((s) => s.test(data))
  if (!kind) throw new HttpError(415, { error: 'unsupported_asset', message: 'Chỉ nhận ảnh PNG, JPEG, GIF, WebP' })

  const sha256 = crypto.createHash('sha256').update(data).digest('hex')
  const [existing] = await db
    .select({ id: asset.id })
    .from(asset)
    .where(and(eq(asset.familyId, familyId), eq(asset.sha256, sha256)))
  if (existing) return { id: existing.id, mime: kind.mime, bytes: data.length }

  const storageKey = `${sha256.slice(0, 2)}/${sha256}.${kind.ext}`
  await storage.put(storageKey, data)
  const [row] = await db
    .insert(asset)
    .values({ familyId, kind: 'image', storageKey, mime: kind.mime, bytes: data.length, sha256 })
    .onConflictDoNothing()
    .returning({ id: asset.id })
  if (row) return { id: row.id, mime: kind.mime, bytes: data.length }
  // Hai request cùng lúc với cùng một ảnh: lấy bản đã được ghi.
  const [again] = await db
    .select({ id: asset.id })
    .from(asset)
    .where(and(eq(asset.familyId, familyId), eq(asset.sha256, sha256)))
  return { id: again!.id, mime: kind.mime, bytes: data.length }
}
