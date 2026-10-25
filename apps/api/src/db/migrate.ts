import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { MIGRATIONS_DIR } from './client.js'

export async function runMigrations(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR })
  } finally {
    await pool.end()
  }
}
