import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeUsername, validateLoginInput, validateNewUser } from '../src/server/auth-utils.js'

test('normaliza o usuário sem alterar maiúsculas em senha', () => {
  assert.equal(normalizeUsername('  Doce.Maria  '), 'doce.maria')
})

test('rejeita usuário e senha vazios no login', () => {
  assert.match(validateLoginInput('', ''), /usuário/)
  assert.match(validateLoginInput('maria', ''), /senha/)
  assert.equal(validateLoginInput('Maria Exemplo', 'senha'.repeat(20)), null)
})

test('valida o formato da conta e o tamanho mínimo da senha', () => {
  assert.equal(validateNewUser('maria_123', 'uma-senha-segura-123'), null)
  assert.match(validateNewUser('ma', 'uma-senha-segura-123'), /usuário/)
  assert.match(validateNewUser('maria', 'curta'), /12 caracteres/)
})
