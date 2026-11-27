import { confirm, input, password } from '@inquirer/prompts'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { hashPassword } from '../src/server/passwords.js'

const connection = await password({ message: 'Cole a URL de conexão do Neon (não será exibida nem salva)' })
let url
try {
  url = new URL(connection)
} catch {
  throw new Error('Informe uma URL PostgreSQL válida.')
}
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.get('uselibpqcompat') === 'true') {
  throw new Error('Informe uma URL PostgreSQL válida sem uselibpqcompat.')
}
url.searchParams.set('sslmode', 'verify-full')

const pool = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 10000 })
let client
try {
  client = await pool.connect()
  const { rows } = await client.query('SELECT current_database() AS database, current_user AS role')
  console.log(`Conectado ao banco ${rows[0].database} com o usuário ${rows[0].role}.`)
  if (!await confirm({ message: 'Preparar este banco vazio e criar o primeiro administrador?', default: false })) {
    console.log('Operação cancelada. Nenhuma alteração foi feita.')
  } else {
    const name = await input({ message: 'Nome do administrador', validate: (v) => !!v.trim() && Array.from(v.trim()).length <= 150 || 'Informe um nome de até 150 caracteres.' })
    const username = await input({ message: 'Nome de usuário', validate: (v) => !!v.trim() && Array.from(v.trim()).length <= 50 || 'Informe um usuário de até 50 caracteres.' })
    const email = await input({ message: 'E-mail', validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && Array.from(v.trim()).length <= 255 || 'Informe um e-mail válido.' })
    const secret = await password({ message: 'Senha do administrador (mínimo 12 caracteres)', validate: (v) => !!v.trim() && Array.from(v).length >= 12 && Array.from(v).length <= 255 || 'A senha deve ter entre 12 e 255 caracteres.' })
    const confirmation = await password({ message: 'Confirme a senha', validate: (v) => v === secret || 'As senhas não coincidem.' })
    if (confirmation !== secret) throw new Error('As senhas não coincidem.')
    const hash = await hashPassword(secret)
    const schema = await readFile(new URL('../db/empty-database.sql', import.meta.url), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('gconfeitaria-initialize'))")
      const existing = await client.query(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') LIMIT 1`,
      )
      if (existing.rowCount) throw new Error('O esquema public não está vazio; nenhuma alteração foi aplicada.')
      await client.query('SET LOCAL search_path TO public')
      await client.query(schema)
      await client.query(
        "INSERT INTO users (name, username, email, password, user_type) SELECT $1, $2, $3, $4, id FROM user_types WHERE name = 'ADMIN'",
        [name.trim(), username.trim(), email.trim(), hash],
      )
      await client.query('COMMIT')
      console.log('Banco preparado e administrador criado.')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
} catch (error) {
  console.error('Não foi possível preparar o banco:', error.message)
  process.exitCode = 1
} finally {
  client?.release()
  await pool.end()
}
