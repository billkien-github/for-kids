import { runMigrations } from '../db/migrate.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Thiếu DATABASE_URL')
await runMigrations(url)
console.log('Đã chạy migration')
