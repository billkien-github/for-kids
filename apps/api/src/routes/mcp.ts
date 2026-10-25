import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Deps } from '../deps.js'
import { buildMcpServer } from '../mcp/server.js'
import { verifyToken } from '../services/tokens.js'

// base64 của ảnh 10MB ≈ 13.4MB, cộng phần JSON xung quanh.
const MCP_BODY_LIMIT = 16 * 1024 * 1024

const HOP_BY_HOP = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive'])

const rpcError =(reply: FastifyReply, status: number, message: string) =>
  reply.code(status).send({ jsonrpc: '2.0', error: { code: -32000, message }, id: null })

function toWebRequest(req: FastifyRequest): Request {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
    else if (v !== undefined) headers.set(k, v)
  }
  // Thân đã được Fastify parse; truyền qua parsedBody nên Request không cần body.
  return new Request(`http://${req.host}${req.url}`, { method: req.method, headers })
}

/**
 * Đường dẫn MCP. `/agent` là bản sao của `/mcp`: một số phần mềm diệt virus (vd. Avast) chặn và làm hỏng
 * response của mọi URL có đoạn "mcp", nên agent chạy trên máy có cài các phần mềm đó dùng `/agent`.
 */
export const MCP_PATHS = ['/mcp', '/agent'] as const

/**
 * MCP qua Streamable HTTP, chế độ stateless, trả JSON (không SSE): mỗi request một server + transport mới (§8).
 * Dùng transport chuẩn Web (Request/Response) rồi để Fastify tự gửi response.
 */
export function mcpRoutes(app: FastifyInstance, deps: Deps) {
  for (const path of MCP_PATHS) registerMcpPath(app, deps, path)
}

function registerMcpPath(app: FastifyInstance, deps: Deps, path: string) {
  app.post(path, { bodyLimit: MCP_BODY_LIMIT }, async (req, reply) => {
    const key = `mcp:${req.ip}`
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    deps.limits.mcpAuth.hit(key)
    const auth = token ? await verifyToken(deps.db, token, deps.clock()) : null
    if (!auth) {
      reply.header('www-authenticate', 'Bearer')
      return rpcError(reply, 401, 'Thiếu hoặc sai token (Authorization: Bearer <token>)')
    }
    deps.limits.mcpAuth.reset(key)

    const server = buildMcpServer(deps, auth)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    let res: Response
    let body: string
    try {
      await server.connect(transport)
      res = await transport.handleRequest(toWebRequest(req), { parsedBody: req.body })
      body = await res.text()
    } finally {
      await transport.close()
      await server.close()
    }
    reply.code(res.status)
    // Không chép header tầng kết nối: Fastify tự đặt độ dài/cách truyền cho body nó gửi.
    res.headers.forEach((value, name) => {
      if (!HOP_BY_HOP.has(name)) reply.header(name, value)
    })
    return body
  })

  // Stateless: không có luồng SSE (GET) hay phiên để xoá (DELETE).
  app.get(path, (_req, reply) => rpcError(reply, 405, 'Method not allowed'))
  app.delete(path, (_req, reply) => rpcError(reply, 405, 'Method not allowed'))
}
