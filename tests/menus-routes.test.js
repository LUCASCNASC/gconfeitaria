import assert from 'node:assert/strict'
import session from 'express-session'
import request from 'supertest'
import test from 'node:test'
import { createApp } from '../src/server/app.js'
import { hashPassword } from '../src/server/passwords.js'

const password = await hashPassword('senha-de-teste')
const menu = { id: '5', name: 'Menu teste', description: null, is_active: true, created_at: '2026-01-01T12:00:00.000Z' }

function setup(query = async () => ({ rows: [] })) {
  const pool = {
    async query(sql, params) {
      if (sql.includes('lower(u.username)')) return { rows: [{ id: '7', username: 'teste', password, is_active: true, role: 'ATENDENTE' }] }
      if (sql.startsWith('SELECT u.id, u.username, u.password')) return { rows: [{ id: '7', username: 'teste', password, role: 'ATENDENTE' }] }
      return query(sql, params)
    },
  }
  return createApp({ pool, sessionStore: new session.MemoryStore(), sessionSecret: 'test-secret-with-more-than-32-characters' })
}

async function login(app) {
  const agent = request.agent(app)
  assert.equal((await agent.post('/api/auth/login').send({ username: 'teste', password: 'senha-de-teste' })).status, 200)
  return agent
}

test('menus exigem autenticação em todas as operações', async () => {
  const app = setup()
  for (const response of [
    await request(app).get('/api/menus'),
    await request(app).get('/api/menus/1'),
    await request(app).post('/api/menus').send({ name: 'Teste' }),
    await request(app).put('/api/menus/1').send({ name: 'Teste', is_active: true }),
    await request(app).delete('/api/menus/1'),
  ]) assert.equal(response.status, 401)
})

test('valida nome, descrição e status antes de gravar', async () => {
  const agent = await login(setup(async () => { throw new Error('Não deve acessar menus') }))
  for (const body of [
    {}, { name: '   ' }, { name: 'a'.repeat(151) }, { name: 'Teste', description: 'a'.repeat(151) },
    { name: 'Teste', description: 4 }, { name: 'Teste', is_active: 'false' }, { name: 'Teste', extra: true },
  ]) assert.equal((await agent.post('/api/menus').send(body)).status, 400)
  assert.equal((await agent.put('/api/menus/1').send({ name: 'Teste' })).status, 400)
  assert.equal((await agent.get('/api/menus/0')).status, 400)
  assert.equal((await agent.delete('/api/menus/9223372036854775808')).status, 400)
})

test('cria, consulta, edita e exclui logicamente menus para usuário autenticado', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('UPDATE menus SET deleted_at')) return { rows: [{ id: '5' }] }
    return { rows: [menu] }
  }))
  const created = await agent.post('/api/menus').send({ name: ' Menu teste ', description: ' ', is_active: false })
  assert.equal(created.status, 201)
  assert.deepEqual(calls.at(-1).params, ['Menu teste', null, false])
  assert.match(calls.at(-1).sql, /INSERT INTO menus .*is_active/)
  assert.equal((await agent.get('/api/menus')).body.menus[0].id, '5')
  assert.match(calls.at(-1).sql, /is_active AS is_active/)
  assert.equal((await agent.get('/api/menus/5')).body.menu.id, '5')
  assert.match(calls.at(-1).sql, /is_active AS is_active/)
  assert.equal((await agent.put('/api/menus/5').send({ name: 'Editado', description: 'Descrição', is_active: false })).status, 200)
  assert.deepEqual(calls.at(-1).params, ['Editado', 'Descrição', false, '5'])
  assert.match(calls.at(-1).sql, /is_active = \$3/)
  assert.equal((await agent.delete('/api/menus/5')).status, 204)
  assert.match(calls.at(-1).sql, /deleted_at = NOW\(\)/)
})

test('retorna 404 para menu ausente ou já excluído', async () => {
  const agent = await login(setup())
  assert.equal((await agent.get('/api/menus/5')).status, 404)
  assert.equal((await agent.put('/api/menus/5').send({ name: 'Teste', is_active: true })).status, 404)
  assert.equal((await agent.delete('/api/menus/5')).status, 404)
})
