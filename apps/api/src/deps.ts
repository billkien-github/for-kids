import { AttemptLimiter } from './auth/rate-limit.js'
import type { Config } from './config.js'
import type { Db } from './db/client.js'

const FIVE_MIN = 5 * 60 * 1000

export type Deps = {
  config: Config
  db: Db
  clock: () => Date
  limits: {
    login: AttemptLimiter
    pin: AttemptLimiter
  }
}

export function createDeps(config: Config, db: Db, clock: () => Date = () => new Date()): Deps {
  const now = () => clock().getTime()
  return {
    config,
    db,
    clock,
    limits: {
      // Khoá theo ip + email, để người lạ không khoá được tài khoản phụ huynh từ máy khác.
      login: new AttemptLimiter(5, FIVE_MIN, now),
      // Khoá theo từng profile (child id) và theo PIN phụ huynh (§2: 5 lần mỗi 5 phút).
      pin: new AttemptLimiter(5, FIVE_MIN, now),
    },
  }
}
