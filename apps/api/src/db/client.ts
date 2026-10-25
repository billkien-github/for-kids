import path from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import pg from 'pg'
import * as schema from './schema.js'

// Kiểu chung cho cả node-postgres (chạy thật) và PGlite (test).
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  return { db: drizzle(pool, { schema }) as Db, pool }
}

// Script, test và Docker đều chạy với cwd = apps/api.
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve('drizzle')
