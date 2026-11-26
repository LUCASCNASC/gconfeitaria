import { hashPassword, verifyPassword } from './passwords.js'

export const passwordMigration = 'passwords-scrypt-v1'

export async function migratePasswords(client) {
  await client.query('BEGIN')
  try {
    await client.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE')
    await client.query(`CREATE TABLE IF NOT EXISTS gconfeitaria_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT NOW()
    )`)
    const existing = await client.query('SELECT 1 FROM gconfeitaria_migrations WHERE name = $1', [passwordMigration])
    if (existing.rowCount) {
      await client.query('COMMIT')
      return 0
    }

    const users = await client.query('SELECT id, password FROM users ORDER BY id')
    for (const user of users.rows) {
      if (typeof user.password !== 'string') throw new Error('Há uma senha inválida; migração cancelada.')
      const passwordHash = await hashPassword(user.password)
      if (!await verifyPassword(user.password, passwordHash)) throw new Error('Falha ao verificar senha; migração cancelada.')
      await client.query('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, user.id])
    }
    await client.query('INSERT INTO gconfeitaria_migrations (name) VALUES ($1)', [passwordMigration])
    await client.query('COMMIT')
    return users.rowCount
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
