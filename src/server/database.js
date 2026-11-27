import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg
let config
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL deve ser uma URL PostgreSQL.')
  if (process.env.NODE_ENV === 'production') {
    if (url.searchParams.get('uselibpqcompat') === 'true') throw new Error('Não use uselibpqcompat em produção.')
    url.searchParams.set('sslmode', 'verify-full')
  }
  config = { connectionString: url.toString() }
} else {
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL é obrigatória em produção.')
  const requiredVariables = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
  const missingVariables = requiredVariables.filter((name) => !process.env[name])
  if (missingVariables.length > 0) throw new Error(`Variáveis ausentes no .env: ${missingVariables.join(', ')}`)
  const port = Number(process.env.DB_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT precisa ser uma porta válida.')
  config = {
    host: process.env.DB_HOST,
    port,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  }
}

export const pool = new Pool({ ...config, connectionTimeoutMillis: 5000, ...(process.env.VERCEL ? { max: 2 } : {}) })

pool.on('error', (error) => {
  console.error('Erro inesperado no pool do PostgreSQL:', error.message)
})
