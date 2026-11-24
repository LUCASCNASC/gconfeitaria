import 'dotenv/config'
import pg from 'pg'

const requiredVariables = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missingVariables = requiredVariables.filter((name) => !process.env[name])

if (missingVariables.length > 0) {
  throw new Error(`Variáveis ausentes no .env: ${missingVariables.join(', ')}`)
}

const port = Number(process.env.DB_PORT)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DB_PORT precisa ser uma porta válida.')
}

const { Pool } = pg

export const pool = new Pool({
  host: process.env.DB_HOST,
  port,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (error) => {
  console.error('Erro inesperado no pool do PostgreSQL:', error.message)
})
