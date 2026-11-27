import assert from 'node:assert/strict'
import session from 'express-session'
import request from 'supertest'
import test from 'node:test'
import { createApp } from '../src/server/app.js'
import { hashPassword } from '../src/server/passwords.js'

const password = await hashPassword('senha-de-teste')
const category = { id: '5', name: 'Categoria teste', description: null, is_active: true, created_at: '2026-01-01T12:00:00.000Z' }

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

test('categorias exigem autenticação em todas as operações', async () => {
  const app = setup()
  for (const response of [
    await request(app).get('/api/categories'), await request(app).get('/api/categories/1'),
    await request(app).post('/api/categories').send({ name: 'Teste' }),
    await request(app).put('/api/categories/1').send({ name: 'Teste', is_active: true }),
    await request(app).delete('/api/categories/1'),
  ]) assert.equal(response.status, 401)
})

test('valida nome e status sem impor limite de 150 caracteres à descrição', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => { calls.push({ sql, params }); return { rows: [category] } }))
  for (const body of [{ name: ' ' }, { name: 'a'.repeat(101) }, { name: 'Teste', is_active: 'false' }, { name: 'Teste', description: 1 }]) {
    assert.equal((await agent.post('/api/categories').send(body)).status, 400)
  }
  assert.equal(calls.length, 0)
  assert.equal((await agent.post('/api/categories').send({ name: 'a'.repeat(100), description: 'b'.repeat(200), is_active: false })).status, 201)
  assert.deepEqual(calls[0].params, ['a'.repeat(100), 'b'.repeat(200), false])
  assert.match(calls[0].sql, /INSERT INTO categories \(name, description, is_active\)/)
  assert.equal((await agent.put('/api/categories/5').send({ name: 'Teste' })).status, 400)
})

test('consulta, edita e exclui logicamente categorias', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => {
    calls.push({ sql, params })
    return { rows: [category] }
  }))
  assert.equal((await agent.get('/api/categories')).body.categories[0].id, '5')
  assert.equal((await agent.get('/api/categories/5')).body.category.id, '5')
  assert.equal((await agent.put('/api/categories/5').send({ name: 'Editada', description: '', is_active: false })).status, 200)
  assert.deepEqual(calls.at(-1).params, ['Editada', null, false, '5'])
  assert.equal((await agent.delete('/api/categories/5')).status, 204)
  assert.match(calls.at(-1).sql, /deleted_at = NOW\(\)/)
})

test('retorna erros para ID inválido e categoria ausente ou excluída', async () => {
  const agent = await login(setup())
  assert.equal((await agent.get('/api/categories/0')).status, 400)
  assert.equal((await agent.get('/api/categories/5')).status, 404)
  assert.equal((await agent.put('/api/categories/5').send({ name: 'Teste', is_active: true })).status, 404)
  assert.equal((await agent.delete('/api/categories/5')).status, 404)
})
