import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'
import { createApp } from '../src/server/app.js'
import { pool } from '../src/server/database.js'
import { LoginRateStore } from '../src/server/login-rate-store.js'
import { verifyDatabase } from '../src/server/verify-database.js'
import { restoreVercelApiPath } from '../src/server/vercel-path.js'

if (process.env.NODE_ENV !== 'production' || process.env.NODEJS_HELPERS !== '0') {
  throw new Error('A API na Vercel requer NODE_ENV=production e NODEJS_HELPERS=0.')
}

const PgSessionStore = connectPgSimple(session)
const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean)

const app = createApp({
  pool,
  sessionStore: new PgSessionStore({ pool, tableName: 'user_sessions', createTableIfMissing: false, pruneSessionInterval: false }),
  sessionSecret: process.env.SESSION_SECRET,
  allowedOrigins,
  cookieSameSite: 'lax',
  loginStore: new LoginRateStore(pool),
})

let ready
export default async function handler(req, res) {
  try {
    req.url = restoreVercelApiPath(req.url)
  } catch (error) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: error.message }))
    return
  }
  try {
    if (!ready) ready = (async () => {
      await verifyDatabase(pool)
      await pool.query('SELECT 1 FROM user_sessions LIMIT 1')
      await pool.query('SELECT 1 FROM login_rate_limits LIMIT 1')
    })()
    await ready
    app(req, res)
  } catch (error) {
    ready = undefined
    console.error('Não foi possível iniciar a API:', error.message)
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'API temporariamente indisponível.' }))
  }
}
