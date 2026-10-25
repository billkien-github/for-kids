import { z } from 'zod'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  UPLOADS_DIR: z.string().default('./data/uploads'),
  // Thư mục bản build của web; có thì API phục vụ luôn FE (một origin).
  WEB_DIST_DIR: z.string().optional(),
  // Cookie chỉ gửi qua HTTPS. Mặc định bật ở production; tắt nếu mở app bằng http qua mạng LAN.
  COOKIE_SECURE: z.stringbool().optional(),
})

export type Config = Omit<z.infer<typeof Env>, 'COOKIE_SECURE'> & { COOKIE_SECURE: boolean }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Cấu hình .env không hợp lệ:\n${z.prettifyError(parsed.error)}`)
  }
  const c = parsed.data
  return { ...c, COOKIE_SECURE: c.COOKIE_SECURE ?? c.NODE_ENV === 'production' }
}
