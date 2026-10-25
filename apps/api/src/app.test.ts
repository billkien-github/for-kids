import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { verify } from '@node-rs/argon2'
import { count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import type { Db } from './db/client.js'
import { MIGRATIONS_DIR } from './db/client.js'
import * as schema from './db/schema.js'
import { seed } from './db/seed.js'
import { BADGES, MATH_TOPICS } from './db/seed-data.js'

const client = new PGlite()
const db = drizzle(client, { schema }) as unknown as Db
const parent = { email: 'Parent@Example.com', password: 'mat-khau-dai', pin: '1234' }

beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR })
})
afterAll(() => client.close())

describe('seed', () => {
  it('tạo môn, huy hiệu, gia đình, phụ huynh và chủ đề/kỹ năng Toán', async () => {
    const { familyId } = await seed(db, { familyName: 'Nhà mình', parent })

    const subjects = await db.select().from(schema.subject)
    expect(subjects.map((s) => s.code).sort()).toEqual(['en', 'math', 'vi'])

    const [p] = await db.select().from(schema.parentUser)
    expect(p!.email).toBe('parent@example.com')
    expect(await verify(p!.passwordHash, parent.password)).toBe(true)
    expect(await verify(p!.parentPinHash, parent.pin)).toBe(true)

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
    await seed(db, { familyName: 'Nhà mình', parent })
    await seed(db, { familyName: 'Nhà mình' })

    expect(await db.select({ n: count() }).from(schema.family)).toEqual([{ n: 1 }])
    expect(await db.select({ n: count() }).from(schema.subject)).toEqual([{ n: 3 }])
    expect(await db.select({ n: count() }).from(schema.skill)).toEqual(before)
  })
})

describe('app', () => {
  const baseEnv = { NODE_ENV: 'test', DATABASE_URL: 'pglite', SESSION_SECRET: 'x'.repeat(32) }

  it('GET /api/health', async () => {
    const app = await buildApp(loadConfig(baseEnv), db)
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    await app.close()
  })

  it('phục vụ web build, đường dẫn SPA trả về index.html, /api lạ trả 404 JSON', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'))
    fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>')
    const app = await buildApp(loadConfig({ ...baseEnv, WEB_DIST_DIR: dir }), db)

    const spa = await app.inject({ method: 'GET', url: '/parent/settings' })
    expect(spa.statusCode).toBe(200)
    expect(spa.body).toContain('id="root"')

    const missing = await app.inject({ method: 'GET', url: '/api/khong-co' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'not_found' })

    await app.close()
    fs.rmSync(dir, { recursive: true })
  })
})
