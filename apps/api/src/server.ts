import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { runMigrations } from './db/migrate.js'

const config = loadConfig()
await runMigrations(config.DATABASE_URL)

const { db, pool } = createDb(config.DATABASE_URL)
const app = await buildApp(config, db)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close()
    await pool.end()
    process.exit(0)
  })
}

await app.listen({ host: '0.0.0.0', port: config.PORT })
