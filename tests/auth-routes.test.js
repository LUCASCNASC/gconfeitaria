import assert from 'node:assert/strict'
import session from 'express-session'
import request from 'supertest'
import test from 'node:test'
import { createApp } from '../src/server/app.js'
import { hashPassword } from '../src/server/passwords.js'

test('login cria sessão, identifica o usuário e logout a encerra', async () => {
  const user = { id: '7', username: 'confeiteira', password: await hashPassword('senha-de-teste-segura'), is_active: true, role: 'ADMIN' }
  const pool = {
    async query(sql) {
      if (sql.includes('lower(u.username)')) return { rows: [user] }
      if (sql.includes('WHERE u.id = $1')) return { rows: [{ id: user.id, username: user.username, password: user.password, role: user.role }] }
      return { rows: [] }
    },
  }
  const app = createApp({
    pool,
    sessionStore: new session.MemoryStore(),
    sessionSecret: 'test-secret-with-more-than-32-characters',
  })
  const client = request.agent(app)

  const loginResponse = await client
    .post('/api/auth/login')
    .send({ username: ' Confeiteira ', password: 'senha-de-teste-segura' })
  assert.equal(loginResponse.status, 200)
  assert.deepEqual(loginResponse.body, { user: { id: '7', username: 'confeiteira', role: 'ADMIN' } })

  const sessionResponse = await client.get('/api/auth/me')
  assert.deepEqual(sessionResponse.body, { user: { id: '7', username: 'confeiteira', role: 'ADMIN' } })

  const logoutResponse = await client.post('/api/auth/logout')
  assert.equal(logoutResponse.status, 204)
  const afterLogoutResponse = await client.get('/api/auth/me')
  assert.deepEqual(afterLogoutResponse.body, { user: null })
})

test('login não autentica uma senha incorreta', async () => {
  const user = {
    id: '7',
    username: 'confeiteira',
    password: await hashPassword('senha-correta-segura'),
  }
  const app = createApp({
    pool: { async query() { return { rows: [user] } } },
    sessionStore: new session.MemoryStore(),
    sessionSecret: 'test-secret-with-more-than-32-characters',
  })

  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: 'confeiteira', password: 'senha-incorreta-segura' })
  assert.equal(response.status, 401)
  assert.deepEqual(response.body, { error: 'Usuário ou senha inválidos.' })
})

test('login informa conta inativa apenas após validar a senha e não cria sessão', async () => {
  const passwordHash = await hashPassword('senha-correta')
  const app = createApp({
    pool: {
      async query(sql) {
        assert.match(sql, /deleted_at IS NULL/)
        assert.doesNotMatch(sql, /is_active = true/)
        return { rows: [{ id: '7', username: 'confeiteira', password: passwordHash, is_active: false }] }
      },
    },
    sessionStore: new session.MemoryStore(),
    sessionSecret: 'test-secret-with-more-than-32-characters',
  })
  const client = request.agent(app)
  const wrongPassword = await client.post('/api/auth/login').send({ username: 'confeiteira', password: 'incorreta' })
  assert.equal(wrongPassword.status, 401)
  assert.equal(wrongPassword.body.error, 'Usuário ou senha inválidos.')
  const inactive = await client.post('/api/auth/login').send({ username: 'confeiteira', password: 'senha-correta' })
  assert.equal(inactive.status, 403)
  assert.equal(inactive.body.error, 'Este usuário está inativo. Entre em contato com o administrador.')
  assert.deepEqual((await client.get('/api/auth/me')).body, { user: null })
})

test('sessão é encerrada se o usuário deixar de estar ativo', async () => {
  const passwordHash = await hashPassword('senha-de-teste')
  const app = createApp({
    pool: {
      async query(sql) {
        if (sql.includes('lower(u.username)')) {
          return { rows: [{ id: '7', username: 'confeiteira', password: passwordHash, is_active: true, role: 'ADMIN' }] }
        }
        assert.match(sql, /u.is_active = true AND u.deleted_at IS NULL/)
        return { rows: [] }
      },
    },
    sessionStore: new session.MemoryStore(),
    sessionSecret: 'test-secret-with-more-than-32-characters',
  })
  const client = request.agent(app)
  assert.equal((await client.post('/api/auth/login').send({ username: 'confeiteira', password: 'senha-de-teste' })).status, 200)
  assert.deepEqual((await client.get('/api/auth/me')).body, { user: null })
})

test('produção exige configuração segura e rejeita alterações sem origem autorizada', async () => {
  const previous = process.env.NODE_ENV
  const previousProxy = process.env.TRUST_PROXY
  try {
    process.env.NODE_ENV = 'production'
    process.env.TRUST_PROXY = 'true'
    assert.throws(() => createApp({
      pool: { async query() { return { rows: [] } } },
      sessionStore: new session.MemoryStore(),
      sessionSecret: 'test-secret-with-more-than-32-characters',
    }), /origem HTTPS/)
    const app = createApp({
      pool: { async query() { return { rows: [] } } },
      sessionStore: new session.MemoryStore(),
      sessionSecret: 'test-secret-with-more-than-32-characters',
      allowedOrigins: ['https://app.example.test'],
    })
    assert.equal((await request(app).post('/api/auth/login').send({ username: 'teste', password: 'teste' })).status, 403)
    assert.equal((await request(app).post('/api/auth/login').set('Origin', 'https://outro.example.test').send({ username: 'teste', password: 'teste' })).status, 403)
    assert.equal((await request(app).post('/api/auth/login').set('Origin', 'https://app.example.test').send({ username: 'teste', password: 'teste' })).status, 401)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
    if (previousProxy === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = previousProxy
  }
})

test('produção emite cookie seguro e mantém a sessão atrás do proxy', async () => {
  const previous = process.env.NODE_ENV
  const previousProxy = process.env.TRUST_PROXY
  try {
    process.env.NODE_ENV = 'production'
    process.env.TRUST_PROXY = 'true'
    const user = { id: '7', username: 'confeiteira', password: await hashPassword('senha-de-teste-segura'), is_active: true, role: 'ADMIN' }
    const app = createApp({
      pool: { async query() { return { rows: [user] } } },
      sessionStore: new session.MemoryStore(),
      sessionSecret: 'test-secret-with-more-than-32-characters',
      allowedOrigins: ['https://app.example.test'],
    })
    const login = await request(app).post('/api/auth/login')
      .set('Origin', 'https://app.example.test')
      .set('X-Forwarded-Proto', 'https')
      .send({ username: user.username, password: 'senha-de-teste-segura' })
    assert.equal(login.status, 200)
    const cookie = login.headers['set-cookie'][0]
    assert.match(cookie, /;\s*Secure/i)
    assert.match(cookie, /;\s*HttpOnly/i)
    assert.match(cookie, /;\s*SameSite=Lax/i)
    const me = await request(app).get('/api/auth/me')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie.split(';')[0])
    assert.deepEqual(me.body, { user: { id: user.id, username: user.username, role: user.role } })
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
    if (previousProxy === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = previousProxy
  }
})

test('frontend oferece fallback apenas para rotas, não para arquivos ou API ausentes', async () => {
  const app = createApp({
    pool: { async query() { return { rows: [] } } },
    sessionStore: new session.MemoryStore(),
    sessionSecret: 'test-secret-with-more-than-32-characters',
    staticDir: '.',
  })
  const page = await request(app).get('/dashboard').set('Accept', 'text/html')
  assert.equal(page.status, 200)
  assert.match(page.text, /<div id="app"><\/div>/)
  assert.equal((await request(app).get('/assets/ausente.js').set('Accept', 'text/html')).status, 404)
  assert.equal((await request(app).get('/api/inexistente').set('Accept', 'text/html')).status, 404)
})
