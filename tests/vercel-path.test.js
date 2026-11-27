import assert from 'node:assert/strict'
import test from 'node:test'
import { restoreVercelApiPath } from '../src/server/vercel-path.js'

test('preserva a rota original ou restaura a rota reescrita pela Vercel', () => {
  assert.equal(restoreVercelApiPath('/api/auth/login'), '/api/auth/login')
  assert.equal(restoreVercelApiPath('/api/index?__g_path=products%2F1%2Fphoto&x=2'), '/api/products/1/photo?x=2')
  assert.throws(() => restoreVercelApiPath('/api/index?__g_path=a&__g_path=b'))
})
