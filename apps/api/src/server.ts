import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { openDb } from './db/client.js'
import { createDeps } from './deps.js'

const config = loadConfig()
const conn = await openDb(config.DATABASE_URL)
await conn.migrate()

const app = await buildApp(createDeps(config, conn.db))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close()
    await conn.close()
    process.exit(0)
  })
}

await app.listen({ host: '0.0.0.0', port: config.PORT })
