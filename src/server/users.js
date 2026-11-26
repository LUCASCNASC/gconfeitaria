import express from 'express'
import { hashPassword } from './passwords.js'

const userFields = 'u.id, u.name, u.username, u.email, t.name AS role, u.user_type AS role_id, u.is_active, u.last_login_at, u.created_at, u.updated_at, u.deleted_at'

function validateId(id) {
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n
}

function validatePassword(password, confirmation) {
  if (typeof password !== 'string' || !password.trim() || Array.from(password).length < 12 || Array.from(password).length > 255) {
    return 'A senha deve ter entre 12 e 255 caracteres e não pode conter apenas espaços.'
  }
  if (typeof confirmation !== 'string' || password !== confirmation) {
    return 'As senhas não coincidem.'
  }
  return null
}

function validateEditableUser(body, required) {
  if (typeof body.email !== 'string' || !body.email.trim() || Array.from(body.email).length > 255) {
    return 'O campo email deve ser um texto não vazio de até 255 caracteres.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return 'Informe um e-mail válido.'
  }
  if ((required || body.role !== undefined) &&
      (typeof body.role !== 'string' || !validateId(body.role))) {
    return 'Selecione um tipo de usuário válido.'
  }
  if ((required || body.is_active !== undefined) && typeof body.is_active !== 'boolean') {
    return 'O campo is_active deve ser verdadeiro ou falso.'
  }
  return null
}

function validateUser(body, isUpdate) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Informe os dados do usuário.'

  const fields = [
    ['name', 150],
    ['username', 50],
    ['password', 255],
  ]
  for (const [field, max] of fields) {
    if (typeof body[field] !== 'string' || !body[field].trim() || Array.from(body[field]).length > max) {
      return `O campo ${field} deve ser um texto não vazio de até ${max} caracteres.`
    }
  }
  return validateEditableUser(body, isUpdate)
}

function isOwnUser(req) {
  return req.session.userId != null && String(req.session.userId) === req.params.id
}

export function createUsersRouter(pool, fingerprintPassword) {
  const router = express.Router()

  router.use((req, res, next) => {
    const profilePath = `/${req.user.id}`
    const ownProfile = (req.method === 'GET' && req.path === profilePath) ||
      (req.method === 'PATCH' && req.path === `${profilePath}/password`)
    if (req.user.role !== 'ADMIN' && !ownProfile) {
      return res.status(403).json({ error: 'Acesso restrito a administradores.' })
    }
    next()
  })

  router.get('/', async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT ${userFields} FROM users u JOIN user_types t ON t.id = u.user_type WHERE u.deleted_at IS NULL ORDER BY u.id`)
      res.json({ users: result.rows })
    } catch (error) {
      next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    if (!validateId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    try {
      const result = await pool.query(
        `SELECT ${userFields} FROM users u JOIN user_types t ON t.id = u.user_type WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [req.params.id],
      )
      if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' })
      res.json({ user: result.rows[0] })
    } catch (error) {
      next(error)
    }
  })

  router.post('/', async (req, res, next) => {
    const error = validateUser(req.body, false) ||
      validatePassword(req.body?.password, req.body?.confirm_password) ||
      (typeof req.body?.role !== 'string' || !validateId(req.body.role) ? 'Selecione um tipo de usuário válido.' : null)
    if (error) return res.status(400).json({ error })

    try {
      const { name, username, email, password, role, is_active = true } = req.body
      const passwordHash = await hashPassword(password)
      const result = await pool.query(
        `WITH selected_type AS (
           SELECT id FROM user_types WHERE id = $5 AND deleted_at IS NULL FOR SHARE
         ), inserted AS (
           INSERT INTO users (name, username, email, password, user_type, is_active)
           SELECT $1, $2, $3, $4, id, $6 FROM selected_type RETURNING *
         )
         SELECT ${userFields} FROM inserted u JOIN user_types t ON t.id = u.user_type`,
        [name.trim(), username.trim(), email.trim(), passwordHash, role, is_active],
      )
      if (!result.rows[0]) return res.status(400).json({ error: 'Tipo de usuário inexistente ou excluído.' })
      res.status(201).json({ user: result.rows[0] })
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Usuário ou e-mail já cadastrado.' })
      next(error)
    }
  })

  router.put('/:id', async (req, res, next) => {
    if (!validateId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    if (isOwnUser(req)) return res.status(403).json({ error: 'Você não pode editar sua própria conta.' })
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Informe os dados do usuário.' })
    }
    const fullUpdate = ['name', 'username', 'password'].some((field) => Object.hasOwn(req.body, field))
    const error = fullUpdate
      ? validateUser(req.body, true) || validatePassword(req.body.password, req.body.confirm_password)
      : validateEditableUser(req.body, true)
    if (error) return res.status(400).json({ error })
    try {
      const { email, role, is_active } = req.body
      let result
      if (fullUpdate) {
        const { name, username, password } = req.body
        const passwordHash = await hashPassword(password)
        result = await pool.query(
          `WITH selected_type AS (SELECT id FROM user_types WHERE id = $5 AND deleted_at IS NULL FOR SHARE),
           updated AS (
             UPDATE users SET name = $1, username = $2, email = $3, password = $4,
               user_type = selected_type.id, is_active = $6, updated_at = NOW()
             FROM selected_type WHERE users.id = $7 AND users.deleted_at IS NULL RETURNING users.*
           )
           SELECT ${userFields} FROM updated u JOIN user_types t ON t.id = u.user_type`,
          [name.trim(), username.trim(), email.trim(), passwordHash, role, is_active, req.params.id],
        )
      } else {
        result = await pool.query(
          `WITH selected_type AS (SELECT id FROM user_types WHERE id = $2 AND deleted_at IS NULL FOR SHARE),
           updated AS (
             UPDATE users SET email = $1, user_type = selected_type.id, is_active = $3, updated_at = NOW()
             FROM selected_type WHERE users.id = $4 AND users.deleted_at IS NULL RETURNING users.*
           )
           SELECT ${userFields} FROM updated u JOIN user_types t ON t.id = u.user_type`,
          [email.trim(), role, is_active, req.params.id],
        )
      }
      if (!result.rows[0]) {
        const existing = await pool.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id])
        if (!existing.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' })
        return res.status(400).json({ error: 'Tipo de usuário inexistente ou excluído.' })
      }
      res.json({ user: result.rows[0] })
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Usuário ou e-mail já cadastrado.' })
      next(error)
    }
  })

  router.patch('/:id/password', async (req, res, next) => {
    if (!validateId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    if (!isOwnUser(req)) return res.status(403).json({ error: 'Você só pode alterar sua própria senha.' })
    const error = validatePassword(req.body?.password, req.body?.confirm_password)
    if (error) return res.status(400).json({ error })

    try {
      const passwordHash = await hashPassword(req.body.password)
      const result = await pool.query(
        `UPDATE users SET password = $1, updated_at = NOW()
         WHERE id = $2 AND is_active = true AND deleted_at IS NULL RETURNING id`,
        [passwordHash, req.params.id],
      )
      if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado ou inativo.' })
      req.session.passwordFingerprint = fingerprintPassword(passwordHash)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  router.patch('/:id/status', async (req, res, next) => {
    if (!validateId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    if (isOwnUser(req)) return res.status(403).json({ error: 'Você não pode editar sua própria conta.' })
    if (typeof req.body?.is_active !== 'boolean') {
      return res.status(400).json({ error: 'O campo is_active deve ser verdadeiro ou falso.' })
    }

    try {
      const result = await pool.query(
        `WITH updated AS (
           UPDATE users SET is_active = $1, updated_at = NOW()
           WHERE id = $2 AND deleted_at IS NULL RETURNING *
         )
         SELECT ${userFields} FROM updated u JOIN user_types t ON t.id = u.user_type`,
        [req.body.is_active, req.params.id],
      )
      if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' })
      res.json({ user: result.rows[0] })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:id', async (req, res, next) => {
    if (!validateId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    if (isOwnUser(req)) {
      return res.status(403).json({ error: 'Você não pode excluir sua própria conta.' })
    }
    try {
      const result = await pool.query(
        `UPDATE users SET deleted_at = NOW(), updated_at = NOW(), is_active = false
         WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [req.params.id],
      )
      if (!result.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  return router
}
