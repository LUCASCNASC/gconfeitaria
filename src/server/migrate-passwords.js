import { hashPassword, isProtectedPassword, verifyPassword } from './passwords.js'

export const passwordMigration = 'passwords-scrypt-v1'

export async function migratePasswords(client, { expectedCount } = {}) {
  await client.query('BEGIN')
  try {
    await client.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE')
    await client.query(`CREATE TABLE IF NOT EXISTS gconfeitaria_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT NOW()
    )`)
    const existing = await client.query('SELECT 1 FROM gconfeitaria_migrations WHERE name = $1', [passwordMigration])
    const users = await client.query('SELECT id, password FROM users ORDER BY id')
    if (expectedCount !== undefined && users.rows.filter((user) => !isProtectedPassword(user.password)).length !== expectedCount) {
      throw new Error('A quantidade de senhas a migrar mudou; migração cancelada.')
    }
    let converted = 0
    for (const user of users.rows) {
      if (isProtectedPassword(user.password)) continue
      if (typeof user.password !== 'string' || !user.password ||
          /^(scrypt\$|\$2[aby]\$|\$(?:argon2|pbkdf2|5|6)\$)/.test(user.password)) {
        throw new Error('Há uma senha inválida ou em formato de hash não suportado; migração cancelada.')
      }
      const passwordHash = await hashPassword(user.password)
      if (!await verifyPassword(user.password, passwordHash)) throw new Error('Falha ao verificar senha; migração cancelada.')
      await client.query('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, user.id])
      converted++
    }
    if (!existing.rowCount) await client.query('INSERT INTO gconfeitaria_migrations (name) VALUES ($1)', [passwordMigration])
    await client.query('COMMIT')
    return converted
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
