import assert from 'node:assert/strict'
import session from 'express-session'
import request from 'supertest'
import test from 'node:test'
import { createApp } from '../src/server/app.js'
import { hashPassword } from '../src/server/passwords.js'

const password = await hashPassword('senha-de-teste')
const address = { cep: '12345-678', city: 'Cidade', state: 'sp', street: 'Rua A', neighborhood: 'Centro', number: '10' }
const input = { name: 'Pessoa Teste', birth_date: '1990-01-02', sex_id: '1', telefone: '11999999999', addresses: [address] }

function setup(query = async () => ({ rows: [] })) {
  const db = { query, release() {} }
  const pool = {
    async query(sql, params) {
      if (sql.includes('lower(u.username)')) return { rows: [{ id: '7', username: 'teste', password, is_active: true, role: 'ATENDENTE' }] }
      if (sql.startsWith('SELECT u.id, u.username, u.password')) return { rows: [{ id: '7', username: 'teste', password, role: 'ATENDENTE' }] }
      return query(sql, params)
    },
    async connect() { return db },
  }
  return createApp({ pool, sessionStore: new session.MemoryStore(), sessionSecret: 'test-secret-with-more-than-32-characters' })
}

async function login(app) {
  const agent = request.agent(app)
  assert.equal((await agent.post('/api/auth/login').send({ username: 'teste', password: 'senha-de-teste' })).status, 200)
  return agent
}

test('clientes e opções exigem autenticação', async () => {
  const app = setup()
  for (const path of ['/api/clients', '/api/clients/1', '/api/sex', '/api/sexual-orientations']) {
    assert.equal((await request(app).get(path)).status, 401)
  }
  assert.equal((await request(app).post('/api/clients').send(input)).status, 401)
  assert.equal((await request(app).put('/api/clients/1').send(input)).status, 401)
  assert.equal((await request(app).delete('/api/clients/1')).status, 401)
})

test('valida campos obrigatórios, datas, formatos e endereços antes de gravar', async () => {
  const agent = await login(setup(async () => { throw new Error('Não deve acessar dados de clientes') }))
  for (const bad of [
    { ...input, name: '' },
    { ...input, birth_date: '2024-02-30' },
    { ...input, sex_id: '0' },
    { ...input, telefone: '' },
    { ...input, cpf: '123' },
    { ...input, addresses: [] },
    { ...input, addresses: [{ ...address, cep: '123' }] },
    { ...input, addresses: [{ ...address, state: 'XX' }] },
    { ...input, addresses: [{ ...address, number: '' }] },
    { ...input, addresses: [{ ...address, id: '1' }] },
  ]) assert.equal((await agent.post('/api/clients').send(bad)).status, 400)
  assert.equal((await agent.put('/api/clients/0').send({ name: 'Teste' })).status, 400)
  assert.equal((await agent.put('/api/clients/1').send({ addresses: [{ ...address, id: '1' }, { ...address, id: '1' }] })).status, 400)
})

test('POST cria cliente e endereços em transação e normaliza CEP e CPF', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT id FROM sex')) return { rows: [{ id: '1' }] }
    if (sql.startsWith('INSERT INTO clients')) {
      assert.equal(params[3], '12345678901')
      return { rows: [{ id: '5' }] }
    }
    if (sql.startsWith('INSERT INTO address')) {
      assert.equal(params[1], '12345678')
      assert.equal(params[3], 'SP')
    }
    if (sql.startsWith('SELECT c.id')) return { rows: [{ id: '5', addresses: [{ id: '10' }] }] }
    return { rows: [] }
  }))
  const response = await agent.post('/api/clients').send({ ...input, cpf: '123.456.789-01' })
  assert.equal(response.status, 201)
  assert.equal(response.body.client.id, '5')
  assert.equal(calls[0].sql, 'BEGIN')
  assert.equal(calls.at(-1).sql, 'COMMIT')
})

test('PUT rejeita endereço de outro cliente e desfaz a transação', async () => {
  const calls = []
  const agent = await login(setup(async (sql) => {
    calls.push(sql)
    if (sql.startsWith('SELECT id FROM clients')) return { rows: [{ id: '5' }] }
    if (sql.startsWith('SELECT id FROM address')) return { rows: [{ id: '10' }] }
    return { rows: [] }
  }))
  const response = await agent.put('/api/clients/5').send({ addresses: [{ ...address, id: '11' }] })
  assert.equal(response.status, 400)
  assert.equal(calls.at(-1), 'ROLLBACK')
  assert.equal(calls.some((sql) => sql === 'COMMIT'), false)
})

test('PUT parcial preserva endereços omitidos e permite limpar campo opcional', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT id FROM clients')) return { rows: [{ id: '5' }] }
    if (sql.startsWith('SELECT c.id')) return { rows: [{ id: '5', social_name: null, addresses: [{ id: '10' }] }] }
    return { rows: [] }
  }))
  const response = await agent.put('/api/clients/5').send({ social_name: null })
  assert.equal(response.status, 200)
  assert.equal(response.body.client.addresses.length, 1)
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('UPDATE clients SET social_name') && params[0] === null))
  assert.equal(calls.some(({ sql }) => sql.includes('UPDATE address')), false)
})

test('CPF duplicado retorna conflito e desfaz a transação', async () => {
  const calls = []
  const agent = await login(setup(async (sql) => {
    calls.push(sql)
    if (sql.startsWith('SELECT 1 FROM clients')) return { rows: [{ '?column?': 1 }] }
    return { rows: [] }
  }))
  assert.equal((await agent.post('/api/clients').send({ ...input, cpf: '12345678901' })).status, 409)
  assert.equal(calls.at(-1), 'ROLLBACK')
  assert.equal(calls.some((sql) => sql.startsWith('INSERT INTO clients')), false)
})

test('consulta, opções e exclusão lógica funcionam para usuário autenticado', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => {
    calls.push(sql)
    if (sql.startsWith('SELECT c.id')) return { rows: params[0] === '99' ? [] : [{ id: '5', addresses: [] }] }
    if (sql.startsWith('SELECT id, name FROM')) return { rows: [{ id: '1', name: 'Opção' }] }
    if (sql.startsWith('UPDATE clients SET deleted_at')) return { rows: [{ id: '5' }] }
    return { rows: [] }
  }))
  assert.equal((await agent.get('/api/clients')).body.clients.length, 1)
  const client = await agent.get('/api/clients/5')
  assert.equal(client.body.client.id, '5')
  assert.equal(client.headers['cache-control'], 'no-store')
  assert.equal((await agent.get('/api/clients/99')).status, 404)
  assert.equal((await agent.get('/api/sex')).body.options.length, 1)
  assert.equal((await agent.get('/api/sexual-orientations')).body.options.length, 1)
  assert.equal((await agent.delete('/api/clients/5')).status, 204)
  assert.ok(calls.some((sql) => sql.startsWith('UPDATE address SET deleted_at')))
})
