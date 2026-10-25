import { hash } from '@node-rs/argon2'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from './client.js'
import { badge, family, parentUser, skill, subject, topic } from './schema.js'
import { BADGES, MATH_TOPICS, SUBJECTS } from './seed-data.js'

export type SeedOptions = {
  familyName: string
  parent?: { email: string; password: string; pin: string }
}

/** Chạy lại nhiều lần vẫn an toàn: chỉ thêm những gì còn thiếu. */
export async function seed(db: Db, opts: SeedOptions) {
  for (const s of SUBJECTS) {
    await db.insert(subject).values({ ...s, familyId: null }).onConflictDoNothing()
  }
  for (const b of BADGES) {
    await db.insert(badge).values(b).onConflictDoNothing()
  }

  const familyId = await ensureFamily(db, opts)
  const [math] = await db
    .select({ id: subject.id })
    .from(subject)
    .where(and(eq(subject.code, 'math'), isNull(subject.familyId)))
  if (!math) throw new Error('Không tìm thấy môn math')

  for (const [i, t] of MATH_TOPICS.entries()) {
    const [row] = await db
      .insert(topic)
      .values({ familyId, subjectId: math.id, name: t.name, gradeMin: t.grades[0], gradeMax: t.grades[1], sortOrder: i })
      .onConflictDoUpdate({
        target: [topic.familyId, topic.subjectId, topic.name],
        set: { gradeMin: t.grades[0], gradeMax: t.grades[1], sortOrder: i },
      })
      .returning({ id: topic.id })
    for (const [code, name] of t.skills) {
      await db
        .insert(skill)
        .values({ familyId, subjectId: math.id, topicId: row!.id, code, name })
        .onConflictDoNothing()
    }
  }

  return { familyId }
}

async function ensureFamily(db: Db, opts: SeedOptions): Promise<string> {
  if (opts.parent) {
    const [existing] = await db
      .select({ familyId: parentUser.familyId })
      .from(parentUser)
      .where(eq(parentUser.email, opts.parent.email.toLowerCase()))
    if (existing) return existing.familyId
  } else {
    const [any] = await db.select({ id: family.id }).from(family).limit(1)
    if (any) return any.id
    throw new Error('Chưa có gia đình nào: cần SEED_PARENT_EMAIL, SEED_PARENT_PASSWORD, SEED_PARENT_PIN')
  }

  const { email, password, pin } = opts.parent
  if (!/^\d{4}$/.test(pin)) throw new Error('SEED_PARENT_PIN phải gồm 4 chữ số')
  if (password.length < 8) throw new Error('SEED_PARENT_PASSWORD cần ít nhất 8 ký tự')

  return db.transaction(async (tx) => {
    const [f] = await tx.insert(family).values({ name: opts.familyName }).returning({ id: family.id })
    await tx.insert(parentUser).values({
      familyId: f!.id,
      email: email.toLowerCase(),
      passwordHash: await hash(password),
      parentPinHash: await hash(pin),
    })
    return f!.id
  })
}
