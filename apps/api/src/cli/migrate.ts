import { openDb } from '../db/client.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Thiếu DATABASE_URL')
const conn = await openDb(url)
try {
  await conn.migrate()
  console.log('Đã chạy migration')
} finally {
  await conn.close()
}
