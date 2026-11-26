import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64, options)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !/^scrypt\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/.test(storedHash)) {
    throw new Error('Hash de senha inválido; verifique a migração do banco.')
  }
  const [, salt, hash] = storedHash.split('$')
  const expected = Buffer.from(hash, 'base64url')
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), 64, options)
  return timingSafeEqual(actual, expected)
}
