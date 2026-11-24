import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { input, password } from '@inquirer/prompts'
import { pool } from '../src/server/database.js'
import { normalizeUsername, validateNewUser, validateUsername } from '../src/server/auth-utils.js'

try {
  const username = normalizeUsername(await input({
    message: 'Nome de usuário',
    validate(value) {
      return validateUsername(normalizeUsername(value)) ?? true
    },
  }))
  const userPassword = await password({
    message: 'Senha (mínimo 12 caracteres)',
    validate(value) {
      return validateNewUser(username, value) === null || 'A senha deve ter pelo menos 12 caracteres e no máximo 72 bytes.'
    },
  })
  const confirmation = await password({ message: 'Confirme a senha' })

  if (userPassword !== confirmation) {
    throw new Error('As senhas não conferem.')
  }

  const passwordHash = await bcrypt.hash(userPassword, 12)
  await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
    [username, passwordHash],
  )
  console.log(`Usuário "${username}" criado.`)
} catch (error) {
  if (error.code === '23505') {
    console.error('Esse usuário já existe.')
  } else {
    console.error('Não foi possível criar o usuário:', error.message)
  }
  process.exitCode = 1
} finally {
  await pool.end()
}
