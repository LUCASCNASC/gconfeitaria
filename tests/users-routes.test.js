import assert from 'node:assert/strict'
import session from 'express-session'
import request from 'supertest'
import test from 'node:test'
import { createApp } from '../src/server/app.js'

const userInput = {
  name: 'Maria',
  username: 'maria',
  email: 'maria@example.test',
  password: 'senha-de-teste',
  confirm_password: 'senha-de-teste',
  role: '2',
  is_active: true,
}

function createTestApp(query, state = { role: 'ADMIN', active: true }) {
  return createApp({
    pool: {
      query(sql, params) {
        if (sql.includes('u.password')) {
          return Promise.resolve({ rows: [{ id: '7', username: 'maria', password: 'senha-de-teste', is_active: true, role: state.role }] })
        }
        if (sql.startsWith('SELECT u.id, u.username, t.name AS role')) {
          return Promise.resolve({ rows: state.active ? [{ id: '7', username: 'maria', role: state.role }] : [] })
        }
        return query(sql, params)
      },
    },
    sessionStore: new session.MemoryStore(),
    sessionSecret: 'test-secret-with-more-than-32-characters',
  })
}

async function authenticatedClient(app) {
  const client = request.agent(app)
  assert.equal((await client.post('/api/auth/login').send({ username: 'maria', password: 'senha-de-teste' })).status, 200)
  return client
}

test('criação valida dados e não inclui senha na resposta', async () => {
  const app = createTestApp(async (sql, params) => {
    assert.match(sql, /INSERT INTO users/)
    assert.match(sql, /deleted_at IS NULL FOR SHARE/)
    assert.deepEqual(params, ['Maria', 'maria', 'maria@example.test', 'senha-de-teste', '2', true])
    assert.doesNotMatch(sql.split('RETURNING')[1], /\bpassword\b/)
    return { rows: [{ id: '1', name: 'Maria', username: 'maria', email: 'maria@example.test' }] }
  })
  const client = await authenticatedClient(app)
  const response = await client.post('/api/users').send(userInput)
  assert.equal(response.status, 201)
  assert.equal(response.body.user.username, 'maria')
  assert.equal(response.body.user.password, undefined)
  assert.equal((await client.post('/api/users').send({ ...userInput, email: 'inválido' })).status, 400)
  const { is_active, ...inputWithoutStatus } = userInput
  assert.equal((await client.post('/api/users').send(inputWithoutStatus)).status, 201)
})

test('cadastro exige confirmação exatamente igual à senha', async () => {
  const app = createTestApp(async () => { throw new Error('Não deve acessar o banco') })
  const client = await authenticatedClient(app)
  for (const confirm_password of [undefined, '', 'Senha-de-teste', 'senha-de-teste ']) {
    const response = await client.post('/api/users').send({ ...userInput, confirm_password })
    assert.equal(response.status, 400)
    assert.equal(response.body.error, 'As senhas não coincidem.')
  }
})

test('lista e busca ignoram excluídos e não retornam senha', async () => {
  const app = createTestApp(async (sql) => {
    assert.match(sql, /deleted_at IS NULL/)
    assert.doesNotMatch(sql, /\bpassword\b/)
    return { rows: [{ id: '1', username: 'maria' }] }
  })
  const client = await authenticatedClient(app)
  assert.deepEqual((await client.get('/api/users')).body, { users: [{ id: '1', username: 'maria' }] })
  assert.deepEqual((await client.get('/api/users/1')).body, { user: { id: '1', username: 'maria' } })
  assert.equal((await client.get('/api/users/0')).status, 400)
  assert.equal((await client.get('/api/users/9223372036854775808')).status, 400)
})

test('PUT exige cadastro completo e DELETE faz exclusão lógica', async () => {
  const app = createTestApp(async (sql) => {
    assert.match(sql, /deleted_at IS NULL/)
    if (sql.includes('deleted_at = NOW()')) {
      assert.match(sql, /is_active = false/)
    } else {
      assert.match(sql, /password = \$4/)
      assert.doesNotMatch(sql.split('RETURNING')[1], /\bpassword\b/)
    }
    return { rows: [{ id: '1' }] }
  })
  const client = await authenticatedClient(app)
  assert.equal((await client.put('/api/users/1').send({ name: 'Maria' })).status, 400)
  assert.equal((await client.put('/api/users/1').send(userInput)).status, 200)
  assert.equal((await client.delete('/api/users/1')).status, 204)
})

test('retorna 404 para usuários inexistentes e 409 para duplicados', async () => {
  const app = createTestApp(async (sql) => {
    if (sql.includes('INSERT INTO users')) throw Object.assign(new Error('duplicate'), { code: '23505' })
    return { rows: [] }
  })

  const client = await authenticatedClient(app)
  assert.equal((await client.get('/api/users/1')).status, 404)
  assert.equal((await client.put('/api/users/1').send(userInput)).status, 404)
  assert.equal((await client.delete('/api/users/1')).status, 404)
  assert.equal((await client.post('/api/users').send(userInput)).status, 409)
})

test('PATCH altera somente status e ignora usuários excluídos', async () => {
  const app = createTestApp(async (sql, params) => {
    assert.match(sql, /SET is_active = \$1, updated_at = NOW\(\)/)
    assert.match(sql, /deleted_at IS NULL/)
    assert.doesNotMatch(sql, /\bpassword\b/)
    return { rows: [{ id: params[1], username: 'maria', is_active: params[0] }] }
  })

  const client = await authenticatedClient(app)
  for (const isActive of [false, true]) {
    const response = await client.patch('/api/users/1/status').send({ is_active: isActive })
    assert.equal(response.status, 200)
    assert.equal(response.body.user.is_active, isActive)
  }
  assert.equal((await client.patch('/api/users/1/status').send({ is_active: 'false' })).status, 400)
  assert.equal((await client.patch('/api/users/0/status').send({ is_active: false })).status, 400)
})

test('PATCH retorna 404 quando o usuário não existe ou foi excluído', async () => {
  const app = createTestApp(async () => ({ rows: [] }))
  const client = await authenticatedClient(app)
  const response = await client.patch('/api/users/99/status').send({ is_active: false })
  assert.equal(response.status, 404)
})

test('PUT edita e-mail, tipo e status sem modificar nome, usuário ou senha', async () => {
  const app = createTestApp(async (sql, params) => {
    assert.match(sql, /SET email = \$1, user_type = selected_type.id, is_active = \$3/)
    assert.doesNotMatch(sql, /\bpassword\b/)
    assert.deepEqual(params, ['novo@example.test', '1', false, '1'])
    return { rows: [{ id: '1', email: 'novo@example.test', role: 'GERENTE', is_active: false }] }
  })
  const client = await authenticatedClient(app)
  const response = await client.put('/api/users/1').send({ email: 'novo@example.test', role: '1', is_active: false })
  assert.equal(response.status, 200)
  assert.equal(response.body.user.is_active, false)
  assert.equal((await client.put('/api/users/1').send({ email: 'novo@example.test', role: '', is_active: false })).status, 400)
  assert.equal((await client.put('/api/users/1').send({ email: 'novo@example.test', role: '1' })).status, 400)
})

test('usuário autenticado pode visualizar, mas não alterar outros dados ou excluir a própria conta', async () => {
  const app = createTestApp(async (sql) => {
    if (sql.startsWith('SELECT ')) return { rows: [{ id: '7', username: 'maria' }] }
    throw new Error('Não deve atualizar a própria conta')
  })
  const client = await authenticatedClient(app)
  assert.equal((await client.get('/api/users/7')).status, 200)
  for (const is_active of [true, false]) {
    assert.equal((await client.put('/api/users/7').send({ email: 'alterado@example.test', role: '2', is_active })).status, 403)
    assert.equal((await client.put('/api/users/7').send({ ...userInput, is_active })).status, 403)
    assert.equal((await client.patch('/api/users/7/status').send({ is_active })).status, 403)
  }
  assert.equal((await client.delete('/api/users/7')).status, 403)
})

test('usuário altera somente a própria senha com confirmação exata', async () => {
  const app = createTestApp(async (sql, params) => {
    assert.match(sql, /SET password = \$1, updated_at = NOW\(\)/)
    assert.match(sql, /is_active = true AND deleted_at IS NULL/)
    assert.match(sql, /RETURNING id/)
    assert.deepEqual(params, [' Nova senha ', '7'])
    return { rows: [{ id: '7' }] }
  })
  const client = await authenticatedClient(app)
  const body = { password: ' Nova senha ', confirm_password: ' Nova senha ' }
  assert.equal((await client.patch('/api/users/8/password').send(body)).status, 403)
  assert.equal((await client.patch('/api/users/7/password').send({ ...body, confirm_password: ' Nova Senha ' })).status, 400)
  assert.equal((await client.patch('/api/users/7/password').send({ ...body, confirm_password: 'Nova senha' })).status, 400)
  assert.equal((await client.patch('/api/users/7/password').send({ password: body.password })).status, 400)
  assert.equal((await client.patch('/api/users/7/password').send({ password: ' ', confirm_password: ' ' })).status, 400)
  assert.equal((await client.patch('/api/users/7/password').send({ password: 'a'.repeat(256), confirm_password: 'a'.repeat(256) })).status, 400)
  const response = await client.patch('/api/users/7/password').send(body)
  assert.equal(response.status, 204)
  assert.equal(response.text, '')
})

test('usuário inativo ou excluído não altera a própria senha', async () => {
  const app = createTestApp(async () => ({ rows: [] }))
  const client = await authenticatedClient(app)
  assert.equal((await client.patch('/api/users/7/password').send({ password: 'nova', confirm_password: 'nova' })).status, 404)
})

test('alterações exigem sessão autenticada', async () => {
  const app = createTestApp(async () => { throw new Error('Não deve acessar o banco') })
  assert.equal((await request(app).get('/api/users')).status, 401)
  assert.equal((await request(app).get('/api/users/7')).status, 401)
  assert.equal((await request(app).get('/api/user-types')).status, 401)
  assert.equal((await request(app).post('/api/users').send(userInput)).status, 401)
  assert.equal((await request(app).put('/api/users/7').send(userInput)).status, 401)
  assert.equal((await request(app).patch('/api/users/7/status').send({ is_active: true })).status, 401)
  assert.equal((await request(app).patch('/api/users/7/password').send({ password: 'nova', confirm_password: 'nova' })).status, 401)
  assert.equal((await request(app).delete('/api/users/7')).status, 401)
})

test('somente ADMIN gerencia usuários; usuário comum acessa apenas o próprio cadastro e senha', async () => {
  const state = { role: 'ATENDENTE', active: true }
  const app = createTestApp(async (sql) => {
    if (sql.startsWith('SELECT ')) return { rows: [{ id: '7', username: 'maria' }] }
    if (sql.includes('SET password')) return { rows: [{ id: '7' }] }
    throw new Error('Não deve alterar outro usuário')
  }, state)
  const client = await authenticatedClient(app)
  assert.equal((await client.get('/api/users')).status, 403)
  assert.equal((await client.get('/api/users/8')).status, 403)
  assert.equal((await client.get('/api/user-types')).status, 403)
  assert.equal((await client.post('/api/users').send(userInput)).status, 403)
  assert.equal((await client.put('/api/users/8').send(userInput)).status, 403)
  assert.equal((await client.patch('/api/users/8/status').send({ is_active: true })).status, 403)
  assert.equal((await client.patch('/api/users/8/password').send({ password: 'nova', confirm_password: 'nova' })).status, 403)
  assert.equal((await client.delete('/api/users/8')).status, 403)
  assert.equal((await client.get('/api/users/7')).status, 200)
  assert.equal((await client.patch('/api/users/7/password').send({ password: 'nova', confirm_password: 'nova' })).status, 204)
  state.role = 'ADMIN'
  assert.equal((await client.get('/api/users')).status, 200)
  state.role = 'ATENDENTE'
  assert.equal((await client.get('/api/users')).status, 403)
  state.active = false
  assert.equal((await client.get('/api/users/7')).status, 401)
})

test('lista tipos não excluídos e rejeita cadastro com tipo indisponível', async () => {
  const app = createTestApp(async (sql) => {
    if (sql.startsWith('SELECT id, name FROM user_types')) {
      assert.match(sql, /deleted_at IS NULL/)
      return { rows: [{ id: '2', name: 'ATENDENTE' }] }
    }
    assert.match(sql, /deleted_at IS NULL FOR SHARE/)
    return { rows: [] }
  })
  const client = await authenticatedClient(app)
  const types = await client.get('/api/user-types')
  assert.deepEqual(types.body, { user_types: [{ id: '2', name: 'ATENDENTE' }] })
  assert.equal((await client.post('/api/users').send({ ...userInput, role: '3' })).status, 400)
  assert.equal((await client.post('/api/users').send({ ...userInput, role: 'inexistente' })).status, 400)
  const { role, ...withoutRole } = userInput
  assert.equal((await client.post('/api/users').send(withoutRole)).status, 400)
})

test('bloqueia a API local em produção e em host externo', async () => {
  const app = createTestApp(async () => { throw new Error('Não deve acessar o banco') })
  const originalNodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    assert.equal((await request(app).get('/api/users')).status, 403)
    process.env.NODE_ENV = 'test'
    assert.equal((await request(app).get('/api/users').set('Host', 'example.com')).status, 403)
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  }
})
