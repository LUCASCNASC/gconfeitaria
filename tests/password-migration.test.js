import assert from 'node:assert/strict'
import test from 'node:test'
import { migratePasswords } from '../src/server/migrate-passwords.js'
import { hashPassword, verifyPassword } from '../src/server/passwords.js'

function database(users, migrated) {
  const calls = []
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params })
      if (sql.startsWith('SELECT 1 FROM gconfeitaria_migrations')) return { rowCount: migrated ? 1 : 0 }
      if (sql.startsWith('SELECT id, password')) return { rows: users, rowCount: users.length }
      return { rows: [] }
    },
  }
}

test('migra novas senhas mesmo com marcador existente e preserva hashes', async () => {
  const protectedHash = await hashPassword('senha-protegida')
  const db = database([{ id: '1', password: protectedHash }, { id: '2', password: ' senha original ' }], true)
  assert.equal(await migratePasswords(db), 1)
  const updates = db.calls.filter(({ sql }) => sql.startsWith('UPDATE users'))
  assert.equal(updates.length, 1)
  assert.equal(updates[0].params[1], '2')
  assert.equal(await verifyPassword(' senha original ', updates[0].params[0]), true)
  assert.equal(db.calls.some(({ sql }) => sql.startsWith('INSERT INTO gconfeitaria_migrations')), false)
  assert.equal(db.calls.at(-1).sql, 'COMMIT')
})

test('primeira execução registra marcador e rejeita hashes não suportados com rollback', async () => {
  const initial = database([{ id: '1', password: 'senha' }], false)
  assert.equal(await migratePasswords(initial), 1)
  assert.ok(initial.calls.some(({ sql }) => sql.startsWith('INSERT INTO gconfeitaria_migrations')))
  const invalid = database([{ id: '1', password: 'senha' }, { id: '2', password: 'scrypt$invalido' }], true)
  await assert.rejects(migratePasswords(invalid), /formato de hash não suportado/)
  assert.equal(invalid.calls.at(-1).sql, 'ROLLBACK')
})

test('interrompe a migração se a quantidade esperada mudou', async () => {
  const db = database([{ id: '1', password: 'senha' }], true)
  await assert.rejects(migratePasswords(db, { expectedCount: 2 }), /quantidade/)
  assert.equal(db.calls.some(({ sql }) => sql.startsWith('UPDATE users')), false)
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK')
})
