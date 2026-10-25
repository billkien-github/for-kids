import { z } from 'zod'

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  UPLOADS_DIR: z.string().default('./data/uploads'),
  // Thư mục bản build của web (tính từ apps/api); có thì API phục vụ luôn FE (một origin).
  WEB_DIST_DIR: z.string().default('../web/dist'),
  // Cờ secure của cookie. Mặc định 'auto': bật khi request đến qua https (ngrok), tắt khi qua http (LAN).
  COOKIE_SECURE: z.union([z.literal('auto'), z.stringbool()]).default('auto'),
})

export type Config = z.infer<typeof Env>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Cấu hình .env không hợp lệ:\n${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}
