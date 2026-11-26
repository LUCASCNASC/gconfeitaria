import { pool } from '../src/server/database.js'
import { migratePasswords } from '../src/server/migrate-passwords.js'

let client
try {
  client = await pool.connect()
  const count = await migratePasswords(client)
  console.log(`Migração concluída: ${count} senha(s) convertida(s).`)
} catch (error) {
  console.error('Migração não concluída:', error.message)
  process.exitCode = 1
} finally {
  if (client) client.release()
  await pool.end()
}
