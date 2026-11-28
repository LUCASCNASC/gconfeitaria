import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('manifesto de instalação usa o diretório da aplicação e ícones PNG válidos', async () => {
  const manifestUrl = new URL('../public/manifest.webmanifest', import.meta.url)
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
  const hostedManifest = new URL('https://example.test/gconfeitaria/manifest.webmanifest')
  assert.equal(new URL(manifest.start_url, hostedManifest).pathname, '/gconfeitaria/')
  assert.equal(new URL(manifest.scope, hostedManifest).pathname, '/gconfeitaria/')
  assert.equal(manifest.display, 'standalone')
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}` && entry.type === 'image/png')
    assert.ok(icon)
    const png = await readFile(new URL(icon.src, manifestUrl))
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
})
