import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from './client.js'
import { child } from './schema.js'

// Mọi truy vấn "bé của gia đình này, chưa bị lưu trữ" đi qua đây.
const activeIn = (familyId: string) => and(eq(child.familyId, familyId), isNull(child.archivedAt))

export function listActiveChildren(db: Db, familyId: string) {
  return db.select().from(child).where(activeIn(familyId)).orderBy(asc(child.sortOrder), asc(child.createdAt))
}

/** Bé mới đứng cuối danh sách. */
export const nextSortOrder = (familyId: string) =>
  sql<number>`(select coalesce(max(${child.sortOrder}), 0) + 1 from ${child} where ${child.familyId} = ${familyId})`

/** `ids` phải đúng bằng tập bé đang hoạt động; trả false nếu lệch (danh sách đã đổi ở máy khác). */
export async function reorderChildren(db: Db, familyId: string, ids: string[]) {
  const current = new Set((await listActiveChildren(db, familyId)).map((c) => c.id))
  if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id))) return false
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(child).set({ sortOrder: i + 1 }).where(eq(child.id, id))
  })
  return true
}

export async function findActiveChild(db: Db, familyId: string, id: string) {
  const [c] = await db
    .select()
    .from(child)
    .where(and(activeIn(familyId), eq(child.id, id)))
  return c
}
