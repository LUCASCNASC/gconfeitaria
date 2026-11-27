import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCpf, formatTelephone } from '../src/services/clients.js'

test('formata CPF progressivamente e preserva dígitos excedentes para validação', () => {
  for (const [input, expected] of [
    ['', ''], ['123', '123'], ['1234', '123.4'], ['12345678901', '123.456.789-01'],
    ['123.456.789-01', '123.456.789-01'], ['123456789012', '123456789012'],
  ]) assert.equal(formatCpf(input), expected)
})

test('formata telefones brasileiros fixos e celulares sem descartar valores não convencionais', () => {
  for (const [input, expected] of [
    ['', ''], ['1', '(1'], ['119', '(11) 9'], ['1133334444', '(11) 3333-4444'],
    ['11987654321', '(11) 98765-4321'], ['(11) 98765-4321', '(11) 98765-4321'],
    ['+55 11 98765-4321', '+55 11 98765-4321'], ['119876543210', '119876543210'],
    ['telefone antigo', 'telefone antigo'],
  ]) assert.equal(formatTelephone(input), expected)
})
