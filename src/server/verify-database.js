import { passwordMigration } from './migrate-passwords.js'

export async function verifyDatabase(pool) {
  await pool.query('SELECT 1')
  const migration = await pool.query('SELECT 1 FROM gconfeitaria_migrations WHERE name = $1', [passwordMigration])
  if (!migration.rowCount) throw new Error('Migração de senhas ausente. Crie um backup e execute npm run db:migrate-passwords.')
  const invalid = await pool.query("SELECT 1 FROM users WHERE password !~ '^scrypt[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{86}$' OR password IS NULL LIMIT 1")
  if (invalid.rowCount) throw new Error('Existem senhas sem proteção; não é possível iniciar a API.')
}
