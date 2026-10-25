import crypto from 'node:crypto'
import type { McpScope, TokenInfo } from '@for-kids/shared'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { apiToken } from '../db/schema.js'
import { HttpError } from '../http.js'

const TOKEN_PREFIX = 'fk_'
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

const toInfo = (t: typeof apiToken.$inferSelect): TokenInfo => ({
  id: t.id,
  name: t.name,
  scopes: t.scopes as McpScope[],
  createdAt: t.createdAt.toISOString(),
  lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  revokedAt: t.revokedAt?.toISOString() ?? null,
})

/** Tạo token cho agent. Token gốc chỉ trả về đúng một lần; server chỉ lưu hash. */
export async function createToken(db: Db, familyId: string, name: string, scopes: McpScope[]) {
  const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url')
  const [row] = await db.insert(apiToken).values({ familyId, name, scopes, tokenHash: hashToken(token) }).returning()
  return { token, info: toInfo(row!) }
}

export async function listTokens(db: Db, familyId: string) {
  const rows = await db.select().from(apiToken).where(eq(apiToken.familyId, familyId)).orderBy(desc(apiToken.createdAt))
  return rows.map(toInfo)
}

export async function revokeToken(db: Db, familyId: string, id: string) {
  const [t] = await db
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiToken.id, id), eq(apiToken.familyId, familyId), isNull(apiToken.revokedAt)))
    .returning({ id: apiToken.id })
  if (!t) throw new HttpError(404, { error: 'not_found' })
}

export type TokenAuth = { tokenId: string; familyId: string; scopes: McpScope[] }

export async function verifyToken(db: Db, token: string, now: Date): Promise<TokenAuth | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null
  const [t] = await db
    .select()
    .from(apiToken)
    .where(and(eq(apiToken.tokenHash, hashToken(token)), isNull(apiToken.revokedAt)))
  if (!t) return null
  await db.update(apiToken).set({ lastUsedAt: now }).where(eq(apiToken.id, t.id))
  return { tokenId: t.id, familyId: t.familyId, scopes: t.scopes as McpScope[] }
}
