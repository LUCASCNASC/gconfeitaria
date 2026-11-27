import assert from 'node:assert/strict'
import session from 'express-session'
import request from 'supertest'
import test from 'node:test'
import { createApp } from '../src/server/app.js'
import { hashPassword } from '../src/server/passwords.js'
import { normalizePrice } from '../src/services/product-validation.js'

const password = await hashPassword('senha-de-teste')
const input = { name: 'Produto teste', code: '', description: '', sale_price: '12,50', cost_price: '3.25', is_active: true, category_id: '1', menu_ids: ['1', '2'] }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const pngPhoto = `data:image/png;base64,${png.toString('base64')}`

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

test('preços aceitam valores positivos com até duas casas e respeitam numeric(10,2)', () => {
  for (const [value, expected] of [['0,01', '0.01'], ['00012', '12.00'], ['99999999,99', '99999999.99']]) assert.equal(normalizePrice(value), expected)
  for (const value of ['0', '0,00', '-1', '0.001', '100000000', '1,234', '', '1e2', 1]) assert.equal(normalizePrice(value), null)
})

test('produtos exigem autenticação', async () => {
  const app = setup()
  for (const response of [
    await request(app).get('/api/products'), await request(app).get('/api/products/1'),
    await request(app).post('/api/products').send(input), await request(app).put('/api/products/1').send(input),
    await request(app).delete('/api/products/1'), await request(app).get('/api/products/1/photo'),
  ]) assert.equal(response.status, 401)
})

test('valida campos obrigatórios, preços e limite de menus antes de acessar o banco', async () => {
  const agent = await login(setup(async () => { throw new Error('Não deve acessar produtos') }))
  for (const body of [
    { ...input, name: ' ' }, { ...input, name: 'x'.repeat(151) }, { ...input, code: 'x'.repeat(51) },
    { ...input, sale_price: '0' }, { ...input, cost_price: '1,999' }, { ...input, category_id: '' },
    { ...input, menu_ids: [] }, { ...input, menu_ids: ['1', '1'] }, { ...input, menu_ids: ['1', '2', '3'] },
    { ...input, is_active: 'true' }, { ...input, unexpected: true },
  ]) assert.equal((await agent.post('/api/products').send(body)).status, 400)
  assert.equal((await agent.put('/api/products/0').send(input)).status, 400)
})

test('criação grava preço e vínculos em transação e exclusão é lógica', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT id FROM categories')) return { rows: [{ id: '1' }] }
    if (sql.startsWith('SELECT id FROM menus')) return { rows: [{ id: '1' }, { id: '2' }] }
    if (sql.startsWith('INSERT INTO products')) return { rows: [{ id: '5' }] }
    if (sql.startsWith('SELECT p.id')) return { rows: [{ id: '5', menus: [{ id: '1' }, { id: '2' }] }] }
    if (sql.startsWith('UPDATE products SET deleted_at')) return { rows: [{ id: '5' }] }
    return { rows: [] }
  }))
  const created = await agent.post('/api/products').send(input)
  assert.equal(created.status, 201)
  assert.equal(created.body.product.menus.length, 2)
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('INSERT INTO products')).params, ['Produto teste', null, null, '12.50', '3.25', true, '1'])
  assert.equal(calls.filter(({ sql }) => sql.startsWith('INSERT INTO menu_procuct')).length, 2)
  assert.equal(calls.at(-1).sql, 'COMMIT')
  assert.equal((await agent.delete('/api/products/5')).status, 204)
  assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE menu_procuct SET deleted_at')))
  assert.equal(calls.at(-1).sql, 'COMMIT')
})

test('referência ausente impede gravação e desfaz transação', async () => {
  const calls = []
  const agent = await login(setup(async (sql) => {
    calls.push(sql)
    if (sql.startsWith('SELECT id FROM categories')) return { rows: [{ id: '1' }] }
    if (sql.startsWith('SELECT id FROM menus')) return { rows: [{ id: '1' }] }
    return { rows: [] }
  }))
  assert.equal((await agent.post('/api/products').send(input)).status, 400)
  assert.equal(calls.at(-1), 'ROLLBACK')
  assert.equal(calls.some((sql) => sql.startsWith('INSERT INTO products')), false)
})

test('retorna 404 para produto ausente e não atualiza vínculos', async () => {
  const calls = []
  const agent = await login(setup(async (sql) => { calls.push(sql); return { rows: [] } }))
  assert.equal((await agent.get('/api/products/5')).status, 404)
  assert.equal((await agent.put('/api/products/5').send(input)).status, 404)
  assert.equal(calls.at(-1), 'ROLLBACK')
  assert.equal(calls.some((sql) => sql.startsWith('UPDATE menu_procuct')), false)
  assert.equal((await agent.delete('/api/products/5')).status, 404)
})

test('grava, substitui, preserva e remove foto na transação do produto', async () => {
  const calls = []
  const agent = await login(setup(async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT id FROM categories')) return { rows: [{ id: '1' }] }
    if (sql.startsWith('SELECT id FROM menus')) return { rows: [{ id: '1' }, { id: '2' }] }
    if (sql.startsWith('INSERT INTO products') || sql.startsWith('SELECT id FROM products')) return { rows: [{ id: '5' }] }
    if (sql.startsWith('INSERT INTO file_product')) return { rows: [{ id: '10' }] }
    if (sql.startsWith('SELECT p.id')) return { rows: [{ id: '5', has_photo: true, menus: [] }] }
    return { rows: [] }
  }))
  assert.equal((await agent.post('/api/products').send({ ...input, photo: pngPhoto })).status, 201)
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('INSERT INTO file_product')).params, ['5', png])
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE products SET id_file')).params, ['10', '5'])
  assert.equal(calls.at(-1).sql, 'COMMIT')

  calls.length = 0
  assert.equal((await agent.put('/api/products/5').send(input)).status, 200)
  assert.equal(calls.some(({ sql }) => sql.startsWith('UPDATE file_product')), false)
  assert.equal(calls.some(({ sql }) => sql.startsWith('UPDATE products SET id_file')), false)

  calls.length = 0
  assert.equal((await agent.put('/api/products/5').send({ ...input, photo: pngPhoto })).status, 200)
  assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE file_product')))
  assert.ok(calls.some(({ sql }) => sql.startsWith('INSERT INTO file_product')))
  assert.equal(calls.at(-1).sql, 'COMMIT')

  calls.length = 0
  assert.equal((await agent.put('/api/products/5').send({ ...input, photo: null })).status, 200)
  assert.deepEqual(calls.find(({ sql }) => sql.startsWith('UPDATE products SET id_file')).params, [null, '5'])
  assert.equal(calls.some(({ sql }) => sql.startsWith('INSERT INTO file_product')), false)
})

test('rejeita foto inválida, formato divergente e arquivos acima do limite', async () => {
  const agent = await login(setup(async () => { throw new Error('Não deve acessar produtos') }))
  for (const photo of [
    'data:image/gif;base64,R0lGODlh', 'data:image/png;base64,SGVsbG8=',
    `data:image/jpeg;base64,${png.toString('base64')}`, 'data:image/png;base64,!!!!',
    `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}`, ['foto'],
  ]) assert.equal((await agent.post('/api/products').send({ ...input, photo })).status, 400)
  assert.equal((await agent.post('/api/products').send({ ...input, photo: 'x'.repeat(7 * 1024 * 1024 + 1) })).status, 413)
})

test('foto é consultada apenas no produto vinculado e responde com o tipo correto', async () => {
  let bytes = png
  const agent = await login(setup(async (sql) => sql.includes('SELECT f.file_data') && bytes ? { rows: [{ file_data: bytes }] } : { rows: [] }))
  const response = await agent.get('/api/products/5/photo')
  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'image/png')
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(response.body, png)
  bytes = Buffer.from('arquivo inválido')
  assert.equal((await agent.get('/api/products/5/photo')).status, 422)
  bytes = null
  assert.equal((await agent.get('/api/products/5/photo')).status, 404)
})

test('falha ao gravar foto desfaz o cadastro', async () => {
  const calls = []
  const agent = await login(setup(async (sql) => {
    calls.push(sql)
    if (sql.startsWith('SELECT id FROM categories')) return { rows: [{ id: '1' }] }
    if (sql.startsWith('SELECT id FROM menus')) return { rows: [{ id: '1' }, { id: '2' }] }
    if (sql.startsWith('INSERT INTO products')) return { rows: [{ id: '5' }] }
    if (sql.startsWith('INSERT INTO file_product')) throw new Error('Falha simulada')
    return { rows: [] }
  }))
  assert.equal((await agent.post('/api/products').send({ ...input, photo: pngPhoto })).status, 500)
  assert.equal(calls.at(-1), 'ROLLBACK')
})
