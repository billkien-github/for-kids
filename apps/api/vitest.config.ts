import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Mỗi test dựng một Postgres nhúng (PGlite) và băm argon2 nên chậm hơn mặc định 5 giây khi chạy song song.
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
})
