import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

test('recupera rotas diretas no GitHub Pages e no domínio raiz', async () => {
  const notFound = await readFile(new URL('../public/404.html', import.meta.url), 'utf8')
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const redirectScript = notFound.match(/<script>([\s\S]*?)<\/script>/)[1]
  const restoreScript = index.match(/<script>([\s\S]*?)<\/script>/)[1]

  for (const [hostname, base, path] of [
    ['lucascnasc.github.io', '/gconfeitaria/', '/gconfeitaria/usuarios'],
    ['gconfeitaria.github.io', '/', '/usuarios'],
  ]) {
    const stored = new Map()
    const sessionStorage = {
      setItem: (key, value) => stored.set(key, value),
      getItem: (key) => stored.get(key),
      removeItem: (key) => stored.delete(key),
    }
    let destination
    let restored
    runInNewContext(redirectScript, {
      sessionStorage,
      location: { hostname, pathname: path, search: '?pagina=2', hash: '#lista', replace: (value) => { destination = value } },
    })
    assert.equal(destination, base)
    runInNewContext(restoreScript, {
      sessionStorage,
      history: { replaceState: (_state, _title, url) => { restored = url } },
    })
    assert.equal(restored, `${path}?pagina=2#lista`)
    assert.equal(stored.size, 0)
  }
})
