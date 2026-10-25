import type { ApiErrorBody } from '@for-kids/shared'
import type { FastifyReply } from 'fastify'
import type { z } from 'zod'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message ?? body.error)
  }
}

/** Validate dữ liệu vào; sai thì trả 400 kèm đường dẫn tới trường sai. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data ?? {})
  if (r.success) return r.data
  throw new HttpError(400, {
    error: 'invalid_input',
    issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** id trên URL không phải uuid thì coi như không tồn tại (tránh lỗi kiểu dữ liệu ở Postgres). */
export function idParam(value: string): string {
  if (!UUID.test(value)) throw new HttpError(404, { error: 'not_found' })
  return value
}

export function sendHttpError(reply: FastifyReply, err: HttpError) {
  if (err.body.retryAfterSec) reply.header('retry-after', String(err.body.retryAfterSec))
  return reply.code(err.status).send(err.body)
}
