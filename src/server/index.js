import 'dotenv/config'
import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'
import { createApp } from './app.js'
import { pool } from './database.js'
import { passwordMigration } from './migrate-passwords.js'

const requiredVariables = ['SESSION_SECRET']
const missingVariables = requiredVariables.filter((name) => !process.env[name])
if (missingVariables.length > 0) {
  throw new Error(`Variáveis ausentes no .env: ${missingVariables.join(', ')}`)
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres.')
}

const port = Number(process.env.PORT ?? 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT precisa ser uma porta válida.')
}

const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const PgSessionStore = connectPgSimple(session)
const sessionStore = new PgSessionStore({
  pool,
  tableName: 'user_sessions',
  createTableIfMissing: true,
})

const app = createApp({
  pool,
  sessionStore,
  sessionSecret: process.env.SESSION_SECRET,
  allowedOrigins,
  cookieSameSite: process.env.COOKIE_SAME_SITE ?? 'lax',
  staticDir: process.env.NODE_ENV === 'production' ? 'dist' : undefined,
})

try {
  await pool.query('SELECT 1')
  const migration = await pool.query('SELECT 1 FROM gconfeitaria_migrations WHERE name = $1', [passwordMigration])
  if (!migration.rowCount) throw new Error('Migração de senhas ausente. Crie um backup e execute npm run db:migrate-passwords.')
  const invalid = await pool.query("SELECT 1 FROM users WHERE password !~ '^scrypt[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{86}$' OR password IS NULL LIMIT 1")
  if (invalid.rowCount) throw new Error('Existem senhas sem proteção; não é possível iniciar a API.')
  const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
  const server = app.listen(port, host, () => {
    console.log(`API pronta em http://${host}:${port}`)
  })

  const shutdown = () => {
    server.close(() => {
      pool.end().then(() => process.exit(0))
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (error) {
  console.error('Não foi possível conectar ao PostgreSQL:', error.message)
  await pool.end()
  process.exitCode = 1
}
