import fs from 'node:fs'
import path from 'node:path'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { sql } from 'drizzle-orm'
import Fastify from 'fastify'
import type { Config } from './config.js'
import type { Db } from './db/client.js'

export async function buildApp(config: Config, db: Db) {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' })

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: { imgSrc: ["'self'", 'data:', 'blob:'] },
    },
  })
  await app.register(cookie, { secret: config.SESSION_SECRET })

  app.get('/api/health', async () => {
    await db.execute(sql`select 1`)
    return { ok: true }
  })

  const webDist = config.WEB_DIST_DIR && path.resolve(config.WEB_DIST_DIR)
  if (webDist && fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false })
    // SPA: mọi đường dẫn không phải /api hay /mcp đều trả về index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/mcp')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'not_found' })
    })
  }

  return app
}
