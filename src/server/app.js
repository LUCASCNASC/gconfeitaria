import { timingSafeEqual } from 'node:crypto'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import session from 'express-session'
import helmet from 'helmet'
import { validateLoginInput } from './auth-utils.js'
import { localOnly } from './local-only.js'
import { createUsersRouter } from './users.js'

const sessionCookieName = 'gconfeitaria.sid'

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

export function createApp({ pool, sessionStore, sessionSecret, allowedOrigins = [], cookieSameSite = 'lax' }) {
  if (!pool || !sessionSecret || sessionSecret.length < 32) {
    throw new Error('A API requer pool do PostgreSQL e SESSION_SECRET com pelo menos 32 caracteres.')
  }

  const app = express()
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
      if (origin && !allowedOrigins.includes(origin)) {
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
      secure: process.env.NODE_ENV === 'production',
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

  app.use('/api/auth', localOnly)

  app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
    const password = req.body?.password
    const inputError = validateLoginInput(username, password)
    if (inputError) return res.status(400).json({ error: inputError })

    try {
      const result = await pool.query(
        `SELECT id, username, password, is_active FROM users
         WHERE lower(username) = lower($1) AND deleted_at IS NULL`,
        [username],
      )
      const user = result.rows[0]
      const actual = Buffer.from(password)
      const expected = Buffer.from(user?.password ?? '')
      const passwordMatches = actual.length === expected.length && timingSafeEqual(actual, expected)

      if (!user || !passwordMatches) {
        return res.status(401).json({ error: 'Usuário ou senha inválidos.' })
      }
      if (user.is_active !== true) {
        return res.status(403).json({ error: 'Este usuário está inativo. Entre em contato com o administrador.' })
      }

      await regenerateSession(req)
      req.session.userId = user.id
      await saveSession(req)
      res.json({ user: { id: user.id, username: user.username } })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/auth/me', async (req, res, next) => {
    if (!req.session.userId) return res.json({ user: null })

    try {
      const result = await pool.query(
        'SELECT id, username FROM users WHERE id = $1 AND is_active = true AND deleted_at IS NULL',
        [req.session.userId],
      )
      const user = result.rows[0]
      if (!user) {
        await destroySession(req)
        res.clearCookie(sessionCookieName, { path: '/' })
        return res.json({ user: null })
      }
      res.json({ user: { id: user.id, username: user.username } })
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
        secure: process.env.NODE_ENV === 'production',
      })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.use('/api/users', createUsersRouter(pool))

  app.get('/api/user-types', localOnly, async (req, res, next) => {
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

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    console.error('Falha na API:', error.message)
    res.status(500).json({ error: 'Não foi possível concluir a solicitação.' })
  })

  return app
}
