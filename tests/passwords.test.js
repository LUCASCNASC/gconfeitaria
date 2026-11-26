import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../src/server/passwords.js'

test('hash preserva senha completa e não armazena texto puro', async () => {
  const password = ` ${'á'.repeat(100)}Senha `
  const hash = await hashPassword(password)
  assert.notEqual(hash, password)
  assert.notEqual(hash, await hashPassword(password))
  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword(password.trim(), hash), false)
  assert.equal(await verifyPassword(`${password}x`, hash), false)
})

test('rejeita hash malformado', async () => {
  await assert.rejects(verifyPassword('senha', 'texto-puro'), /Hash de senha inválido/)
})
