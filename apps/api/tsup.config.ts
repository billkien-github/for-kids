import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/cli/migrate.ts', 'src/cli/seed.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  // shared là mã nguồn TS trong workspace nên phải gộp vào bundle.
  noExternal: ['@for-kids/shared'],
})
