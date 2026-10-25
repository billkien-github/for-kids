import fs from 'node:fs'
import path from 'node:path'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { sql } from 'drizzle-orm'
import Fastify from 'fastify'
import { loadSession } from './auth/session.js'
import type { Deps } from './deps.js'
import { HttpError, sendHttpError } from './http.js'
import { assetRoutes } from './routes/assets.js'
import { authRoutes } from './routes/auth.js'
import { kidRoutes } from './routes/kid.js'
import { mcpRoutes } from './routes/mcp.js'
import { parentChildrenRoutes } from './routes/parent-children.js'
import { parentContentRoutes } from './routes/parent-content.js'
import { parentSettingsRoutes } from './routes/parent-settings.js'

export async function buildApp(deps: Deps) {
  const { config, db } = deps
  // Tin đúng 1 proxy phía trước (ngrok trong Docker, hoặc Vite khi dev): req.ip là địa chỉ do proxy đó ghi,
  // client không giả được bằng cách tự gửi X-Forwarded-For.
  const app = Fastify({ logger: config.NODE_ENV !== 'test', trustProxy: (_addr: string, hop: number) => hop < 1 })

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'blob:'],
        // Để mở được bằng http qua mạng LAN; khi qua ngrok thì đã là https sẵn.
        upgradeInsecureRequests: null,
      },
    },
  })
  await app.register(cookie)

  app.decorateRequest('auth', null)
  app.addHook('onRequest', loadSession(deps))
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return sendHttpError(reply, err)
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: 'bad_request', message: (err as Error).message })
    req.log.error(err)
    return reply.code(500).send({ error: 'internal_error' })
  })

  app.get('/api/health', async () => {
    await db.execute(sql`select 1`)
    return { ok: true }
  })
  authRoutes(app, deps)
  parentChildrenRoutes(app, deps)
  parentContentRoutes(app, deps)
  parentSettingsRoutes(app, deps)
  assetRoutes(app, deps)
  kidRoutes(app, deps)
  mcpRoutes(app, deps)

  const webDist = config.WEB_DIST_DIR && path.resolve(config.WEB_DIST_DIR)
  const serveWeb = Boolean(webDist && fs.existsSync(webDist))
  if (serveWeb) {
    await app.register(fastifyStatic, { root: webDist as string, wildcard: false })
  } else if (webDist) {
    app.log.warn(`WEB_DIST_DIR=${webDist} không tồn tại, không phục vụ web`)
  }
  // SPA: mọi đường dẫn GET không phải /api hay /mcp đều trả về index.html.
  app.setNotFoundHandler((req, reply) => {
    if (serveWeb && req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/mcp')) {
      return reply.sendFile('index.html')
    }
    return reply.code(404).send({ error: 'not_found' })
  })

  return app
}
