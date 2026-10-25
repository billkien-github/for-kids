import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import type { Db } from './db/client.js'
import { MIGRATIONS_DIR } from './db/client.js'
import * as schema from './db/schema.js'
import { seed } from './db/seed.js'
import { createDeps } from './deps.js'

export const TEST_PARENT = { email: 'parent@example.com', password: 'mat-khau-dai', pin: '1234' }

export async function createTestDb() {
  const client = new PGlite()
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR })
  const db = drizzle(client, { schema }) as unknown as Db
  return { db, close: () => client.close() }
}

// Migration + seed chỉ chạy một lần mỗi file test; các test sau nạp lại bản chụp thư mục dữ liệu.
let seededSnapshot: Promise<Blob> | undefined

async function getSeededSnapshot() {
  seededSnapshot ??= (async () => {
    const client = new PGlite()
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR })
    await seed(drizzle(client, { schema }) as unknown as Db, { familyName: 'Nhà test', parent: TEST_PARENT })
    const snapshot = await client.dumpDataDir('none')
    await client.close()
    return snapshot
  })()
  return seededSnapshot
}

/** App đã seed sẵn 1 gia đình + phụ huynh, với đồng hồ chỉnh tay được. */
export async function createTestApp(env: Record<string, string> = {}) {
  const client = new PGlite({ loadDataDir: await getSeededSnapshot() })
  const db = drizzle(client, { schema }) as unknown as Db
  const close = () => client.close()

  let now = new Date('2026-10-26T08:00:00+07:00')
  const clock = {
    now: () => now,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  }
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'pglite', SESSION_SECRET: 'x'.repeat(32), ...env })
  const app = await buildApp(createDeps(config, db, clock.now))

  return {
    app,
    db,
    clock,
    close: async () => {
      await app.close()
      await close()
    },
  }
}
