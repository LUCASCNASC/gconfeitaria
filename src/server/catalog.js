import express from 'express'

const validId = (id) => typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n

export function createCatalogRouter(pool, { table, singular, plural, subject, notFound, nameMax, descriptionMax, statusColumn }) {
  const router = express.Router()
  const fields = `id::text AS id, name, description, created_at, ${statusColumn} AS is_active`

  function validate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((key) => !['name', 'description', 'is_active'].includes(key))) {
      return { error: `Informe os dados ${subject}.` }
    }
    if (typeof body.name !== 'string' || !body.name.trim()) return { error: 'O nome é obrigatório.' }
    if (Array.from(body.name.trim()).length > nameMax) return { error: `O nome deve ter no máximo ${nameMax} caracteres.` }
    if (body.description != null && typeof body.description !== 'string') return { error: 'A descrição deve ser um texto.' }
    const description = body.description?.trim() || null
    if (descriptionMax && description && Array.from(description).length > descriptionMax) return { error: `A descrição deve ter no máximo ${descriptionMax} caracteres.` }
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') return { error: 'Informe um status válido.' }
    return { name: body.name.trim(), description, is_active: body.is_active ?? true }
  }

  router.get('/', async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT ${fields} FROM ${table} WHERE deleted_at IS NULL ORDER BY id`)
      res.json({ [plural]: result.rows })
    } catch (error) { next(error) }
  })

  router.get('/:id', async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    try {
      const result = await pool.query(`SELECT ${fields} FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [req.params.id])
      if (!result.rows.length) return res.status(404).json({ error: notFound })
      res.json({ [singular]: result.rows[0] })
    } catch (error) { next(error) }
  })

  router.post('/', async (req, res, next) => {
    const data = validate(req.body)
    if (data.error) return res.status(400).json({ error: data.error })
    try {
      const result = await pool.query(
        `INSERT INTO ${table} (name, description, ${statusColumn}) VALUES ($1, $2, $3) RETURNING ${fields}`,
        [data.name, data.description, data.is_active],
      )
      res.status(201).json({ [singular]: result.rows[0] })
    } catch (error) { next(error) }
  })

  router.put('/:id', async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    const data = validate(req.body)
    if (data.error) return res.status(400).json({ error: data.error })
    if (req.body.is_active === undefined) return res.status(400).json({ error: `Informe o status ${subject}.` })
    try {
      const result = await pool.query(
        `UPDATE ${table} SET name = $1, description = $2, ${statusColumn} = $3, updated_at = NOW()
         WHERE id = $4 AND deleted_at IS NULL RETURNING ${fields}`,
        [data.name, data.description, data.is_active, req.params.id],
      )
      if (!result.rows.length) return res.status(404).json({ error: notFound })
      res.json({ [singular]: result.rows[0] })
    } catch (error) { next(error) }
  })

  router.delete('/:id', async (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
    try {
      const result = await pool.query(
        `UPDATE ${table} SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [req.params.id],
      )
      if (!result.rows.length) return res.status(404).json({ error: notFound })
      res.status(204).end()
    } catch (error) { next(error) }
  })

  return router
}
