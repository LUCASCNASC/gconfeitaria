import express from 'express'
import { MAX_PRODUCT_PHOTO_BYTES, normalizePrice } from '../services/product-validation.js'

const validId = (id) => typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n

class ProductError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function parseInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['name', 'code', 'description', 'sale_price', 'cost_price', 'is_active', 'category_id', 'menu_ids', 'photo'].includes(key))) {
    throw new ProductError(400, 'Informe os dados do produto.')
  }
  if (typeof body.name !== 'string' || !body.name.trim()) throw new ProductError(400, 'O nome é obrigatório.')
  if (Array.from(body.name.trim()).length > 150) throw new ProductError(400, 'O nome deve ter no máximo 150 caracteres.')
  for (const field of ['code', 'description']) {
    if (body[field] != null && typeof body[field] !== 'string') throw new ProductError(400, `O campo ${field} deve ser um texto.`)
  }
  const code = body.code?.trim() || null
  if (code && Array.from(code).length > 50) throw new ProductError(400, 'O código deve ter no máximo 50 caracteres.')
  const salePrice = normalizePrice(body.sale_price)
  const costPrice = normalizePrice(body.cost_price)
  if (!salePrice || !costPrice) throw new ProductError(400, 'Informe preços maiores que zero com até duas casas decimais.')
  if (typeof body.is_active !== 'boolean') throw new ProductError(400, 'Informe um status válido.')
  if (!validId(body.category_id)) throw new ProductError(400, 'Selecione uma categoria.')
  if (!Array.isArray(body.menu_ids) || body.menu_ids.length < 1 || body.menu_ids.length > 2 ||
      body.menu_ids.some((id) => !validId(id)) || new Set(body.menu_ids).size !== body.menu_ids.length) {
    throw new ProductError(400, 'Selecione um ou dois menus distintos.')
  }
  return {
    name: body.name.trim(), code, description: body.description?.trim() || null,
    sale_price: salePrice, cost_price: costPrice, is_active: body.is_active,
    category_id: body.category_id, menu_ids: body.menu_ids,
    photo: body.photo === undefined || body.photo === null ? body.photo : parsePhoto(body.photo),
  }
}

function photoType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  return null
}

function parsePhoto(value) {
  if (typeof value !== 'string') throw new ProductError(400, 'Selecione uma foto JPEG ou PNG válida.')
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match || match[2].length % 4 !== 0 || match[2].length > Math.ceil(MAX_PRODUCT_PHOTO_BYTES / 3) * 4) {
    throw new ProductError(400, 'Selecione uma foto JPEG ou PNG de até 3 MiB.')
  }
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_PRODUCT_PHOTO_BYTES || bytes.toString('base64') !== match[2] || photoType(bytes) !== match[1]) {
    throw new ProductError(400, 'Selecione uma foto JPEG ou PNG de até 3 MiB.')
  }
  return bytes
}

async function validateReferences(db, data) {
  const category = await db.query('SELECT id FROM categories WHERE id = $1 AND deleted_at IS NULL FOR SHARE', [data.category_id])
  if (!category.rows.length) throw new ProductError(400, 'Selecione uma categoria disponível.')
  const menus = await db.query('SELECT id FROM menus WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL ORDER BY id FOR SHARE', [data.menu_ids])
  if (menus.rows.length !== data.menu_ids.length) throw new ProductError(400, 'Selecione menus disponíveis.')
}

async function readProducts(db, id) {
  const result = await db.query(
    `SELECT p.id::text AS id, p.name, p.code, p.description, p.sale_price::text AS sale_price,
       p.cost_price::text AS cost_price, p.is_active, p.created_at, p.category_id::text AS category_id,
       c.name AS category_name,
       EXISTS (SELECT 1 FROM file_product f WHERE f.id = p.id_file AND f.id_product = p.id AND f.deleted_at IS NULL) AS has_photo,
       COALESCE((SELECT json_agg(json_build_object('id', m.id::text, 'name', m.name)
         ORDER BY mp.id) FROM menu_procuct mp JOIN menus m ON m.id = mp.menu_id
         WHERE mp.product_id = p.id AND mp.deleted_at IS NULL), '[]'::json) AS menus
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.deleted_at IS NULL AND ($1::bigint IS NULL OR p.id = $1) ORDER BY p.id`,
    [id],
  )
  return result.rows
}

async function replacePhoto(db, productId, photo) {
  if (photo === undefined) return
  await db.query('UPDATE file_product SET deleted_at = NOW() WHERE id = (SELECT id_file FROM products WHERE id = $1) AND id_product = $1 AND deleted_at IS NULL', [productId])
  let photoId = null
  if (photo !== null) {
    const result = await db.query('INSERT INTO file_product (id_product, file_data) VALUES ($1, $2) RETURNING id', [productId, photo])
    photoId = result.rows[0].id
  }
  await db.query('UPDATE products SET id_file = $1 WHERE id = $2', [photoId, productId])
}

async function replaceMenus(db, productId, menuIds) {
  await db.query('UPDATE menu_procuct SET deleted_at = NOW() WHERE product_id = $1 AND deleted_at IS NULL AND NOT (menu_id = ANY($2::bigint[]))', [productId, menuIds])
  for (const menuId of menuIds) {
    await db.query(
      `INSERT INTO menu_procuct (product_id, menu_id)
       SELECT $1, $2 WHERE NOT EXISTS
         (SELECT 1 FROM menu_procuct WHERE product_id = $1 AND menu_id = $2 AND deleted_at IS NULL)`,
      [productId, menuId],
    )
  }
}

async function transaction(pool, operation) {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const result = await operation(db)
    await db.query('COMMIT')
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  } finally {
    db.release()
  }
}

export function createProductsRouter(pool) {
  const router = express.Router()
  const productJson = express.json({ limit: 4400000 })

  router.get('/', async (req, res, next) => {
    try { res.json({ products: await readProducts(pool, null) }) } catch (error) { next(error) }
  })

  router.get('/:id/photo', async (req, res, next) => {
    try {
      if (!validId(req.params.id)) throw new ProductError(400, 'ID inválido.')
      const result = await pool.query(
        `SELECT f.file_data FROM products p JOIN file_product f ON f.id = p.id_file AND f.id_product = p.id
         WHERE p.id = $1 AND p.deleted_at IS NULL AND f.deleted_at IS NULL`,
        [req.params.id],
      )
      if (!result.rows.length) throw new ProductError(404, 'Foto não encontrada.')
      const bytes = result.rows[0].file_data
      if (process.env.VERCEL && bytes.length > 4400000) throw new ProductError(413, 'Esta foto antiga excede o limite da hospedagem; substitua-a por uma foto de até 3 MiB.')
      const type = photoType(bytes)
      if (!type) throw new ProductError(422, 'A foto armazenada não é um JPEG ou PNG válido.')
      res.set('Cache-Control', 'no-store').type(type).send(bytes)
    } catch (error) { next(error) }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      if (!validId(req.params.id)) throw new ProductError(400, 'ID inválido.')
      const [product] = await readProducts(pool, req.params.id)
      if (!product) throw new ProductError(404, 'Produto não encontrado.')
      res.json({ product })
    } catch (error) { next(error) }
  })

  router.post('/', productJson, async (req, res, next) => {
    try {
      const data = parseInput(req.body)
      const product = await transaction(pool, async (db) => {
        await validateReferences(db, data)
        const result = await db.query(
          `INSERT INTO products (name, code, description, sale_price, cost_price, is_active, category_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text AS id`,
          [data.name, data.code, data.description, data.sale_price, data.cost_price, data.is_active, data.category_id],
        )
        await replaceMenus(db, result.rows[0].id, data.menu_ids)
        await replacePhoto(db, result.rows[0].id, data.photo)
        return (await readProducts(db, result.rows[0].id))[0]
      })
      res.status(201).json({ product })
    } catch (error) { next(error) }
  })

  router.put('/:id', productJson, async (req, res, next) => {
    try {
      if (!validId(req.params.id)) throw new ProductError(400, 'ID inválido.')
      const data = parseInput(req.body)
      const product = await transaction(pool, async (db) => {
        const current = await db.query('SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [req.params.id])
        if (!current.rows.length) throw new ProductError(404, 'Produto não encontrado.')
        await validateReferences(db, data)
        await db.query(
          `UPDATE products SET name = $1, code = $2, description = $3, sale_price = $4, cost_price = $5,
           is_active = $6, category_id = $7, updated_at = NOW() WHERE id = $8`,
          [data.name, data.code, data.description, data.sale_price, data.cost_price, data.is_active, data.category_id, req.params.id],
        )
        await replaceMenus(db, req.params.id, data.menu_ids)
        await replacePhoto(db, req.params.id, data.photo)
        return (await readProducts(db, req.params.id))[0]
      })
      res.json({ product })
    } catch (error) { next(error) }
  })

  router.delete('/:id', async (req, res, next) => {
    try {
      if (!validId(req.params.id)) throw new ProductError(400, 'ID inválido.')
      await transaction(pool, async (db) => {
        const result = await db.query('UPDATE products SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [req.params.id])
        if (!result.rows.length) throw new ProductError(404, 'Produto não encontrado.')
        await db.query('UPDATE menu_procuct SET deleted_at = NOW() WHERE product_id = $1 AND deleted_at IS NULL', [req.params.id])
        await db.query('UPDATE file_product SET deleted_at = NOW() WHERE id = (SELECT id_file FROM products WHERE id = $1) AND id_product = $1 AND deleted_at IS NULL', [req.params.id])
      })
      res.status(204).end()
    } catch (error) { next(error) }
  })

  router.use((error, req, res, next) => {
    if (error instanceof ProductError) return res.status(error.status).json({ error: error.message })
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'A solicitação excede o limite permitido para a foto.' })
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' })
    next(error)
  })
  return router
}
