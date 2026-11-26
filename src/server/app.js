import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { extname, resolve } from 'node:path'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import session from 'express-session'
import helmet from 'helmet'
import { validateLoginInput } from './auth-utils.js'
import { createClientsRouter } from './clients.js'
import { localOnly } from './local-only.js'
import { hashPassword, verifyPassword } from './passwords.js'
import { createUsersRouter } from './users.js'

const sessionCookieName = 'gconfeitaria.sid'
const dummyPasswordHash = hashPassword(randomBytes(32).toString('base64url'))

async function findSessionUser(pool, id) {
  const result = await pool.query(
    `SELECT u.id, u.username, u.password, t.name AS role FROM users u
     LEFT JOIN user_types t ON t.id = u.user_type AND t.deleted_at IS NULL
     WHERE u.id = $1 AND u.is_active = true AND u.deleted_at IS NULL`,
    [id],
  )
  return result.rows[0]
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()))
  })
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()))
  })
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()))
  })
}

export function createApp({ pool, sessionStore, sessionSecret, allowedOrigins = [], cookieSameSite = 'lax', staticDir }) {
  if (!pool || !sessionSecret || sessionSecret.length < 32) {
    throw new Error('A API requer pool do PostgreSQL e SESSION_SECRET com pelo menos 32 caracteres.')
  }

  const app = express()
  const production = process.env.NODE_ENV === 'production'
  if (production && (!sessionStore || cookieSameSite !== 'lax' ||
      allowedOrigins.length !== 1 || !/^https:\/\/[^/]+$/.test(allowedOrigins[0]) ||
      process.env.TRUST_PROXY !== 'true')) {
    throw new Error('Produção requer sessão persistente, uma origem HTTPS, cookies SameSite=Lax e proxy confiável.')
  }
  const fingerprintPassword = (hash) => createHmac('sha256', sessionSecret).update(hash).digest('base64url')
  const validSession = (req, user) => {
    if (!user || typeof req.session.passwordFingerprint !== 'string') return false
    const actual = Buffer.from(req.session.passwordFingerprint)
    const expected = Buffer.from(fingerprintPassword(user.password))
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  const localOrProduction = (req, res, next) => production ? next() : localOnly(req, res, next)
  app.disable('x-powered-by')
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin))
    },
    credentials: true,
  }))
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin')
      if ((!origin && production) || (origin && !allowedOrigins.includes(origin))) {
        return res.status(403).json({ error: 'Origem não autorizada.' })
      }
    }
    next()
  })
  app.use(express.json({ limit: '10kb' }))
  app.use(session({
    name: sessionCookieName,
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: production,
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    },
  }))

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
  })

  app.get('/api/health', async (req, res, next) => {
    try {
      await pool.query('SELECT 1')
      res.json({ status: 'ok' })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api/auth', localOrProduction)

  app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
    const password = req.body?.password
    const inputError = validateLoginInput(username, password)
    if (inputError) return res.status(400).json({ error: inputError })

    try {
      const result = await pool.query(
        `SELECT u.id, u.username, u.password, u.is_active, t.name AS role FROM users u
         LEFT JOIN user_types t ON t.id = u.user_type AND t.deleted_at IS NULL
         WHERE lower(u.username) = lower($1) AND u.deleted_at IS NULL`,
        [username],
      )
      const user = result.rows[0]
      const passwordMatches = await verifyPassword(password, user?.password ?? await dummyPasswordHash)

      if (!user || !passwordMatches) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
      }
      if (user.is_active !== true) {
        return res.status(403).json({ error: 'Este usuário está inativo. Entre em contato com o administrador.' })
      }

      await regenerateSession(req)
      req.session.userId = user.id
      req.session.passwordFingerprint = fingerprintPassword(user.password)
      await saveSession(req)
      res.json({ user: { id: user.id, username: user.username, role: user.role } })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/auth/me', async (req, res, next) => {
    if (!req.session.userId) return res.json({ user: null })

    try {
      const user = await findSessionUser(pool, req.session.userId)
      if (!validSession(req, user)) {
        await destroySession(req)
        res.clearCookie(sessionCookieName, { path: '/' })
        return res.json({ user: null })
      }
      res.json({ user: { id: user.id, username: user.username, role: user.role } })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      if (req.session) await destroySession(req)
      res.clearCookie(sessionCookieName, {
        path: '/',
        httpOnly: true,
        sameSite: cookieSameSite,
        secure: production,
      })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  async function requireUser(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Faça login para continuar.' })
    try {
      const user = await findSessionUser(pool, req.session.userId)
      if (!validSession(req, user)) {
        await destroySession(req)
        res.clearCookie(sessionCookieName, { path: '/' })
        return res.status(401).json({ error: 'Sessão inválida ou usuário inativo.' })
      }
      req.user = user
      next()
    } catch (error) {
      next(error)
    }
  }

  function requireAdmin(req, res, next) {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso restrito a administradores.' })
    next()
  }

  app.use('/api/users', localOrProduction, requireUser, createUsersRouter(pool, fingerprintPassword))
  app.use('/api/clients', localOrProduction, requireUser, (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  }, createClientsRouter(pool))

  for (const [route, table] of [['sex', 'sex'], ['sexual-orientations', 'sexual_orientation']]) {
    app.get(`/api/${route}`, localOrProduction, requireUser, async (req, res, next) => {
      try {
        const result = await pool.query(`SELECT id, name FROM ${table} ORDER BY name, id`)
        res.json({ options: result.rows })
      } catch (error) {
        next(error)
      }
    })
  }

  app.get('/api/user-types', localOrProduction, requireUser, requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id, name FROM user_types WHERE deleted_at IS NULL ORDER BY name, id')
      res.json({ user_types: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' })
  })

  if (staticDir) {
    const directory = resolve(staticDir)
    app.use(express.static(directory, { index: 'index.html' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || extname(req.path) || !req.get('accept')?.includes('text/html')) return next()
      res.sendFile(resolve(directory, 'index.html'), (error) => { if (error) next(error) })
    })
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    console.error('Falha na API:', error.message)
    res.status(500).json({ error: 'Não foi possível concluir a solicitação.' })
  })

  return app
}
