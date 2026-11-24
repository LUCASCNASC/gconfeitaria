import 'dotenv/config'
import { password } from '@inquirer/prompts'
import dotenv from 'dotenv'
import pg from 'pg'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const requiredVariables = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER']
const missingVariables = requiredVariables.filter((name) => !process.env[name])

if (missingVariables.length > 0) {
  console.error(`Configure estas variáveis no .env: ${missingVariables.join(', ')}`)
  process.exitCode = 1
} else {
  const enteredPassword = await password({
    message: `Senha atual do papel ${process.env.DB_USER}`,
    validate(value) {
      return value.length > 0 || 'A senha não pode ficar vazia.'
    },
  })

  const { Pool } = pg
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: enteredPassword,
    connectionTimeoutMillis: 5000,
  })

  try {
    await pool.query('SELECT 1')
    const envPath = fileURLToPath(new URL('../.env', import.meta.url))
    const envContents = await readFile(envPath, 'utf8')
    const passwordEntry = `DB_PASSWORD='${enteredPassword}'`
    if (dotenv.parse(passwordEntry).DB_PASSWORD !== enteredPassword) {
      throw new Error('A senha não pode conter quebras de linha.')
    }
    const updatedContents = /^DB_PASSWORD=.*$/m.test(envContents)
      ? envContents.replace(/^DB_PASSWORD=.*$/m, passwordEntry)
      : `${envContents.trimEnd()}\n${passwordEntry}\n`
    await writeFile(envPath, updatedContents, 'utf8')
    console.log('Conexão validada e DB_PASSWORD atualizado no .env local.')
  } catch (error) {
    if (error.code === '28P01') {
      console.error('O PostgreSQL recusou a senha informada; o .env não foi alterado.')
    } else {
      console.error('Não foi possível validar ou salvar a conexão:', error.message)
    }
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
