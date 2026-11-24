import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from '../src/server/database.js'

try {
  const schemaPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url))
  const schema = await readFile(schemaPath, 'utf8')
  await pool.query(schema)
  console.log('Tabela de usuários pronta.')
} catch (error) {
  console.error('Não foi possível preparar o banco:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
