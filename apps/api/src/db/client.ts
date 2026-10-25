import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import pg from 'pg'
import * as schema from './schema.js'

// Kiểu chung cho cả node-postgres (chạy thật) và PGlite (dev không có Docker, test).
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// Script, test và Docker đều chạy với cwd = apps/api.
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve('drizzle')

const PGLITE_PREFIX = 'pglite:'

/**
 * Mở kết nối DB. `postgres://…` dùng node-postgres.
 * `pglite:<thư mục>` dùng Postgres nhúng (PGlite), chỉ để dev trên máy chưa cài Docker.
 */
export async function openDb(databaseUrl: string): Promise<{ db: Db; migrate: () => Promise<void>; close: () => Promise<void> }> {
  if (databaseUrl.startsWith(PGLITE_PREFIX)) {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite')
    const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator')
    const client = new PGlite(path.resolve(databaseUrl.slice(PGLITE_PREFIX.length)))
    return {
      db: drizzlePglite(client, { schema }) as unknown as Db,
      migrate: () => migratePglite(drizzlePglite(client), { migrationsFolder: MIGRATIONS_DIR }),
      close: () => client.close(),
    }
  }

  const pool = new pg.Pool({ connectionString: databaseUrl })
  return {
    db: drizzle(pool, { schema }) as Db,
    migrate: () => migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR }),
    close: () => pool.end(),
  }
}
