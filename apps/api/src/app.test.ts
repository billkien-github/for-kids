import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verify } from '@node-rs/argon2'
import { count, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import * as schema from './db/schema.js'
import { seed } from './db/seed.js'
import { BADGES, MATH_TOPICS } from './db/seed-data.js'
import { createTestApp, createTestDb, TEST_PARENT } from './test-utils.js'

describe('seed', async () => {
  const { db, close } = await createTestDb()
  afterAll(close)

  it('tạo môn, huy hiệu, gia đình, phụ huynh và chủ đề/kỹ năng Toán', async () => {
    const { familyId } = await seed(db, { familyName: 'Nhà mình', parent: { ...TEST_PARENT, email: 'Parent@Example.com' } })

    const subjects = await db.select().from(schema.subject)
    expect(subjects.map((s) => s.code).sort()).toEqual(['en', 'math', 'vi'])

    const [p] = await db.select().from(schema.parentUser)
    expect(p!.email).toBe('parent@example.com')
    expect(await verify(p!.passwordHash, TEST_PARENT.password)).toBe(true)
    expect(await verify(p!.parentPinHash, TEST_PARENT.pin)).toBe(true)

    const [f] = await db.select().from(schema.family).where(eq(schema.family.id, familyId))
    expect(f!.starThresholds).toEqual([50, 75, 90])

    const topics = await db.select().from(schema.topic)
    expect(topics).toHaveLength(MATH_TOPICS.length)
    const [skills] = await db.select({ n: count() }).from(schema.skill)
    expect(skills!.n).toBe(MATH_TOPICS.flatMap((t) => t.skills).length)
    const [badges] = await db.select({ n: count() }).from(schema.badge)
    expect(badges!.n).toBe(BADGES.length)
  })

  it('chạy lại không tạo trùng', async () => {
    const before = await db.select({ n: count() }).from(schema.skill)
    await seed(db, { familyName: 'Nhà mình', parent: TEST_PARENT })
    await seed(db, { familyName: 'Nhà mình' })

    expect(await db.select({ n: count() }).from(schema.family)).toEqual([{ n: 1 }])
    expect(await db.select({ n: count() }).from(schema.subject)).toEqual([{ n: 3 }])
    expect(await db.select({ n: count() }).from(schema.skill)).toEqual(before)
  })
})

describe('app', () => {
  it('GET /api/health', async () => {
    const t = await createTestApp()
    const res = await t.app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    await t.close()
  })

  it('phục vụ web build, đường dẫn SPA trả về index.html, /api lạ trả 404 JSON', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>')
    const t = await createTestApp({ WEB_DIST_DIR: dir })

    const spa = await t.app.inject({ method: 'GET', url: '/parent/settings' })
    expect(spa.statusCode).toBe(200)
    expect(spa.body).toContain('id="root"')

    const missing = await t.app.inject({ method: 'GET', url: '/api/khong-co' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'not_found' })

    await t.close()
    fs.rmSync(dir, { recursive: true })
  })

  it('WEB_DIST_DIR không tồn tại thì trả 404, không lỗi 500', async () => {
    const t = await createTestApp({ WEB_DIST_DIR: path.join(os.tmpdir(), 'khong-co-thu-muc-nay') })
    const res = await t.app.inject({ method: 'GET', url: '/parent/children' })
    expect(res.statusCode).toBe(404)
    await t.close()
  })
})
