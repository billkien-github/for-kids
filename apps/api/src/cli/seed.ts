import { openDb } from '../db/client.js'
import { seed } from '../db/seed.js'

const env = process.env
if (!env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL')

const conn = await openDb(env.DATABASE_URL)
try {
  await conn.migrate()
  const parent =
    env.SEED_PARENT_EMAIL && env.SEED_PARENT_PASSWORD && env.SEED_PARENT_PIN
      ? { email: env.SEED_PARENT_EMAIL, password: env.SEED_PARENT_PASSWORD, pin: env.SEED_PARENT_PIN }
      : undefined
  const { familyId } = await seed(conn.db, { familyName: env.SEED_FAMILY_NAME || 'Nhà mình', parent })
  console.log(`Đã seed xong (family ${familyId})`)
} finally {
  await conn.close()
}
