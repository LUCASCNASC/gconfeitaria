import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCepAddress } from '../src/services/clients.js'

test('preenche os campos retornados pelo CEP sem alterar número ou referência', () => {
  const address = { city: '', state: '', street: '', neighborhood: '', complement: '', number: '123', reference_point: 'Praça' }
  const initial = { ...address }
  applyCepAddress(address, { localidade: 'São Paulo', uf: 'SP', logradouro: 'Praça da Sé', bairro: 'Sé', complemento: 'lado ímpar' }, initial)
  assert.deepEqual(address, { city: 'São Paulo', state: 'SP', street: 'Praça da Sé', neighborhood: 'Sé', complement: 'lado ímpar', number: '123', reference_point: 'Praça' })
})

test('preserva campos editados durante a consulta e dados não retornados', () => {
  const address = { city: 'Original', state: 'SP', street: 'Rua anterior', neighborhood: 'Centro', complement: 'Sala 1' }
  const initial = { ...address }
  address.street = 'Rua editada'
  applyCepAddress(address, { localidade: 'Nova cidade', uf: 'RJ', logradouro: 'Rua do CEP', bairro: '', complemento: null }, initial)
  assert.deepEqual(address, { city: 'Nova cidade', state: 'RJ', street: 'Rua editada', neighborhood: 'Centro', complement: 'Sala 1' })
})
