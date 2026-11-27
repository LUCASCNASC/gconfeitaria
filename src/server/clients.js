import express from 'express'

const clientFields = {
  name: { max: 150, required: true },
  social_name: { max: 150 },
  birth_date: { required: true, date: true },
  sex_id: { required: true, id: true },
  sexual_orientation_id: { id: true },
  cpf: { cpf: true },
  telefone: { max: 20, required: true },
  email: { max: 255, email: true },
}

const addressFields = {
  cep: { cep: true, required: true },
  city: { max: 100, required: true },
  state: { state: true, required: true },
  street: { max: 150, required: true },
  neighborhood: { max: 100, required: true },
  number: { max: 20, required: true },
  complement: { max: 100 },
  reference_point: { max: 200 },
}

const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '))
const validId = (id) => typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n

class ClientError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateFields(input, definitions, partial = false) {
  if (!isObject(input)) throw new ClientError(400, 'Informe os dados em um objeto.')
  const result = {}
  for (const [field, rules] of Object.entries(definitions)) {
    if (!Object.hasOwn(input, field)) {
      if (!partial && rules.required) throw new ClientError(400, `O campo ${field} é obrigatório.`)
      continue
    }
    let value = input[field]
    if (typeof value === 'string') value = value.trim()
    if (value === '' || value === null) {
      if (rules.required) throw new ClientError(400, `O campo ${field} é obrigatório.`)
      result[field] = null
      continue
    }
    if (typeof value !== 'string') throw new ClientError(400, `O campo ${field} deve ser um texto.`)
    if (rules.max && Array.from(value).length > rules.max) throw new ClientError(400, `O campo ${field} excede ${rules.max} caracteres.`)
    if (rules.id && !validId(value)) throw new ClientError(400, `O campo ${field} deve ser um ID válido.`)
    if (rules.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ClientError(400, 'Informe um e-mail válido.')
    if (rules.date) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN)
      if (value.startsWith('0000-') || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ClientError(400, 'Informe uma data de nascimento válida no formato AAAA-MM-DD.')
    }
    if (rules.cpf) {
      if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) throw new ClientError(400, 'Informe o CPF com 11 dígitos, com ou sem pontuação.')
      value = value.replace(/\D/g, '')
    }
    if (rules.cep) {
      if (!/^(?:\d{8}|\d{5}-\d{3})$/.test(value)) throw new ClientError(400, 'Informe o CEP com 8 dígitos, com ou sem hífen.')
      value = value.replace(/\D/g, '')
    }
    if (rules.state) {
      value = value.toUpperCase()
      if (!states.has(value)) throw new ClientError(400, 'Informe uma sigla de estado brasileira válida.')
    }
    result[field] = value
  }
  return result
}

function parseInput(body, partial) {
  if (!isObject(body)) throw new ClientError(400, 'Informe os dados do cliente.')
  const allowed = new Set([...Object.keys(clientFields), 'addresses', 'marketing_consent'])
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new ClientError(400, 'Há campos desconhecidos no cliente.')
  const marketingConsent = Object.hasOwn(body, 'marketing_consent')
    ? body.marketing_consent
    : partial ? undefined : false
  if (marketingConsent !== undefined && typeof marketingConsent !== 'boolean') {
    throw new ClientError(400, 'O campo marketing_consent deve ser verdadeiro ou falso.')
  }
  const fields = validateFields(body, clientFields, partial)
  let addresses
  if (Object.hasOwn(body, 'addresses')) {
    if (!Array.isArray(body.addresses) || body.addresses.length === 0) throw new ClientError(400, 'Informe pelo menos um endereço.')
    const seen = new Set()
    addresses = body.addresses.map((address) => {
      if (!isObject(address) || Object.keys(address).some((key) => key !== 'id' && !Object.hasOwn(addressFields, key))) {
        throw new ClientError(400, 'Endereço inválido ou com campos desconhecidos.')
      }
      if (Object.hasOwn(address, 'id')) {
        if (!partial || !validId(address.id) || seen.has(address.id)) throw new ClientError(400, 'ID de endereço inválido ou repetido.')
        seen.add(address.id)
      }
      return { ...validateFields(address, addressFields), ...(address.id ? { id: address.id } : {}) }
    })
  } else if (!partial) {
    throw new ClientError(400, 'Informe pelo menos um endereço.')
  }
  if (partial && !Object.keys(fields).length && addresses === undefined && marketingConsent === undefined) {
    throw new ClientError(400, 'Informe ao menos um campo para edição.')
  }
  return { fields, addresses, marketingConsent }
}

async function validateReferences(db, fields) {
  for (const [field, table] of [['sex_id', 'sex'], ['sexual_orientation_id', 'sexual_orientation']]) {
    if (fields[field] != null) {
      const result = await db.query(`SELECT id FROM ${table} WHERE id = $1 FOR KEY SHARE`, [fields[field]])
      if (!result.rows.length) throw new ClientError(400, `O campo ${field} não corresponde a uma opção existente.`)
    }
  }
}

async function checkCpf(db, cpf, id) {
  if (cpf == null) return
  await db.query('LOCK TABLE clients IN SHARE ROW EXCLUSIVE MODE')
  const result = await db.query(
    "SELECT 1 FROM clients WHERE deleted_at IS NULL AND regexp_replace(cpf, '[^0-9]', '', 'g') = $1 AND ($2::bigint IS NULL OR id <> $2::bigint) LIMIT 1",
    [cpf, id],
  )
  if (result.rows.length) throw new ClientError(409, 'CPF já cadastrado.')
}

async function replaceAddresses(db, clientId, addresses) {
  const previous = await db.query('SELECT id FROM address WHERE client_id = $1 AND deleted_at IS NULL FOR UPDATE', [clientId])
  const existing = new Set(previous.rows.map((row) => row.id))
  const keep = addresses.filter((address) => address.id).map((address) => address.id)
  if (keep.some((id) => !existing.has(id))) throw new ClientError(400, 'Endereço inexistente ou não pertence ao cliente.')
  await db.query('UPDATE address SET deleted_at = NOW(), updated_at = NOW() WHERE client_id = $1 AND deleted_at IS NULL AND NOT (id = ANY($2::bigint[]))', [clientId, keep])
  for (const address of addresses) {
    const keys = Object.keys(addressFields)
    const values = keys.map((key) => address[key] ?? null)
    if (address.id) {
      await db.query(
        `UPDATE address SET ${keys.map((key, index) => `${key} = $${index + 1}`).join(', ')}, updated_at = NOW() WHERE id = $${keys.length + 1} AND client_id = $${keys.length + 2} AND deleted_at IS NULL`,
        [...values, address.id, clientId],
      )
    } else {
      await db.query(
        `INSERT INTO address (client_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, index) => `$${index + 2}`).join(', ')})`,
        [clientId, ...values],
      )
    }
  }
}

async function readClients(db, id) {
  const result = await db.query(
    `SELECT c.id, c.name, c.social_name, to_char(c.birth_date, 'YYYY-MM-DD') AS birth_date,
       c.sex_id, c.sexual_orientation_id, c.cpf, c.telefone, c.email, c.marketing_consent, c.marketing_consent_at,
       c.marketing_consent_withdrawn_at, c.marketing_consent_withdrawn_by::text AS marketing_consent_withdrawn_by,
       c.created_at, c.updated_at,
       COALESCE((SELECT json_agg(json_build_object(
         'id', a.id::text, 'cep', a.cep, 'city', a.city, 'state', a.state, 'street', a.street,
         'neighborhood', a.neighborhood, 'number', a.number, 'complement', a.complement,
         'reference_point', a.reference_point
       ) ORDER BY a.id) FROM address a WHERE a.client_id = c.id AND a.deleted_at IS NULL), '[]'::json) AS addresses
     FROM clients c WHERE c.deleted_at IS NULL AND ($1::bigint IS NULL OR c.id = $1) ORDER BY c.id`,
    [id],
  )
  return result.rows
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

export function createClientsRouter(pool) {
  const router = express.Router()

  router.get('/', async (req, res, next) => {
    try { res.json({ clients: await readClients(pool, null) }) } catch (error) { next(error) }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      if (!validId(req.params.id)) throw new ClientError(400, 'ID inválido.')
      const [client] = await readClients(pool, req.params.id)
      if (!client) throw new ClientError(404, 'Cliente não encontrado.')
      res.json({ client })
    } catch (error) { next(error) }
  })

  router.post('/', async (req, res, next) => {
    try {
      const { fields, addresses, marketingConsent } = parseInput(req.body, false)
      const client = await transaction(pool, async (db) => {
        await checkCpf(db, fields.cpf, null)
        await validateReferences(db, fields)
        const keys = Object.keys(fields)
        const consentIndex = keys.length + 1
        const actorIndex = keys.length + 2
        const result = await db.query(
          `INSERT INTO clients (${keys.join(', ')}, marketing_consent, marketing_consent_at, marketing_consent_recorded_by,
             marketing_consent_version, marketing_consent_withdrawn_at, marketing_consent_withdrawn_by)
           VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')}, $${consentIndex},
             CASE WHEN $${consentIndex} THEN NOW() END,
             CASE WHEN $${consentIndex} THEN $${actorIndex}::bigint END,
             CASE WHEN $${consentIndex} THEN 'v1' END, NULL, NULL)
           RETURNING id`,
          [...keys.map((key) => fields[key]), marketingConsent, req.user.id],
        )
        await replaceAddresses(db, result.rows[0].id, addresses)
        return (await readClients(db, result.rows[0].id))[0]
      })
      res.status(201).json({ client })
    } catch (error) { next(error) }
  })

  router.put('/:id', async (req, res, next) => {
    try {
      if (!validId(req.params.id)) throw new ClientError(400, 'ID inválido.')
      const { fields, addresses, marketingConsent } = parseInput(req.body, true)
      const client = await transaction(pool, async (db) => {
        if (fields.cpf != null) await checkCpf(db, fields.cpf, req.params.id)
        const current = await db.query('SELECT id FROM clients WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [req.params.id])
        if (!current.rows.length) throw new ClientError(404, 'Cliente não encontrado.')
        await validateReferences(db, fields)
        const keys = Object.keys(fields)
        const assignments = keys.map((key, i) => `${key} = $${i + 1}`)
        const values = keys.map((key) => fields[key])
        if (marketingConsent !== undefined) {
          const consentIndex = values.length + 1
          const actorIndex = values.length + 2
          assignments.push(
            `marketing_consent = $${consentIndex}`,
            `marketing_consent_at = CASE WHEN $${consentIndex} THEN CASE WHEN marketing_consent IS TRUE THEN marketing_consent_at ELSE NOW() END ELSE marketing_consent_at END`,
            `marketing_consent_recorded_by = CASE WHEN $${consentIndex} AND marketing_consent IS NOT TRUE THEN $${actorIndex} ELSE marketing_consent_recorded_by END`,
            `marketing_consent_version = CASE WHEN $${consentIndex} AND marketing_consent IS NOT TRUE THEN 'v1' ELSE marketing_consent_version END`,
            `marketing_consent_withdrawn_at = CASE WHEN $${consentIndex} THEN NULL WHEN marketing_consent IS TRUE OR marketing_consent_withdrawn_at IS NULL THEN NOW() ELSE marketing_consent_withdrawn_at END`,
            `marketing_consent_withdrawn_by = CASE WHEN $${consentIndex} THEN NULL WHEN marketing_consent IS TRUE OR marketing_consent_withdrawn_at IS NULL THEN $${actorIndex} ELSE marketing_consent_withdrawn_by END`,
          )
          values.push(marketingConsent, req.user.id)
        }
        assignments.push('updated_at = NOW()')
        await db.query(
          `UPDATE clients SET ${assignments.join(', ')} WHERE id = $${values.length + 1}`,
          [...values, req.params.id],
        )
        if (addresses) await replaceAddresses(db, req.params.id, addresses)
        return (await readClients(db, req.params.id))[0]
      })
      res.json({ client })
    } catch (error) { next(error) }
  })

  router.delete('/:id', async (req, res, next) => {
    try {
      if (!validId(req.params.id)) throw new ClientError(400, 'ID inválido.')
      await transaction(pool, async (db) => {
        const result = await db.query('UPDATE clients SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [req.params.id])
        if (!result.rows.length) throw new ClientError(404, 'Cliente não encontrado.')
        await db.query('UPDATE address SET deleted_at = NOW(), updated_at = NOW() WHERE client_id = $1 AND deleted_at IS NULL', [req.params.id])
      })
      res.status(204).end()
    } catch (error) { next(error) }
  })

  router.use((error, req, res, next) => {
    if (error instanceof ClientError) return res.status(error.status).json({ error: error.message })
    if (error.code === '23505' && error.constraint === 'idx_clients_cpf_active') return res.status(409).json({ error: 'CPF já cadastrado.' })
    if (error.code === '42703' && error.message.includes('marketing_consent')) return res.status(503).json({ error: 'As migrações de consentimento de clientes ainda não foram aplicadas ao banco.' })
    next(error)
  })
  return router
}
