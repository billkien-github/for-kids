import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from './client.js'
import { child } from './schema.js'

// Mọi truy vấn "bé của gia đình này, chưa bị lưu trữ" đi qua đây.
const activeIn = (familyId: string) => and(eq(child.familyId, familyId), isNull(child.archivedAt))

export function listActiveChildren(db: Db, familyId: string) {
  return db.select().from(child).where(activeIn(familyId)).orderBy(asc(child.createdAt))
}

export async function findActiveChild(db: Db, familyId: string, id: string) {
  const [c] = await db
    .select()
    .from(child)
    .where(and(activeIn(familyId), eq(child.id, id)))
  return c
}
