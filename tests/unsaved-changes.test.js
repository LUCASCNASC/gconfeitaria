import assert from 'node:assert/strict'
import test from 'node:test'
import { createRenderer, defineComponent, h, reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useUnsavedChanges } from '../src/composables/useUnsavedChanges.js'

function createTestApp() {
  const renderer = createRenderer({
    createElement: (type) => ({ type, children: [] }),
    createText: (text) => ({ text }),
    createComment: (text) => ({ text }),
    setText: (node, text) => { node.text = text },
    setElementText: (node, text) => { node.text = text },
    parentNode: (node) => node.parent,
    nextSibling: () => null,
    insert(node, parent) { node.parent = parent; parent.children.push(node) },
    remove(node) {
      if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node)
    },
    patchProp() {},
  })
  const form = reactive({ name: '' })
  let guard
  let confirmed = false
  let prompts = 0
  let busy = false
  let busyWarnings = 0
  const edit = defineComponent({
    setup() {
      guard = useUnsavedChanges(() => JSON.stringify(form), {
        isBusy: () => busy,
        onBusy: () => { busyWarnings++ },
      })
      guard.dialog.value = { confirm: async () => { prompts++; return confirmed } }
      return () => h('div')
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/edit/:id', component: edit },
      { path: '/list', component: { render: () => h('div') } },
    ],
  })
  const app = renderer.createApp({ render: () => h(RouterView) })
  app.use(router)
  return {
    app, router, form,
    get guard() { return guard },
    set confirmed(value) { confirmed = value },
    set busy(value) { busy = value },
    get prompts() { return prompts },
    get busyWarnings() { return busyWarnings },
  }
}

test('alterações exigem confirmação ao sair ou trocar de usuário; salvar e reverter dispensam aviso', async () => {
  const previousWindow = globalThis.window
  globalThis.window = new EventTarget()
  const instance = createTestApp()
  try {
    await instance.router.push('/edit/1')
    instance.app.mount({ children: [] })
    instance.form.name = 'Alterado'
    assert.equal((await instance.router.push('/list')).type, 4)
    assert.equal(instance.router.currentRoute.value.path, '/edit/1')
    assert.equal(instance.prompts, 1)
    assert.equal((await instance.router.push('/edit/2')).type, 4)
    assert.equal(instance.prompts, 2)
    await instance.router.push('/edit/1?pagina=2')
    assert.equal(instance.prompts, 2)
    instance.form.name = ''
    await instance.router.push('/edit/2')
    assert.equal(instance.prompts, 2)
    instance.form.name = 'Salvo'
    instance.guard.markSaved()
    await instance.router.push('/list')
    assert.equal(instance.prompts, 2)
  } finally {
    instance.app.unmount()
    globalThis.window = previousWindow
  }
})

test('beforeunload acompanha alterações e é removido ao desmontar; operações pendentes bloqueiam saída', async () => {
  const previousWindow = globalThis.window
  const browser = new EventTarget()
  globalThis.window = browser
  const instance = createTestApp()
  try {
    await instance.router.push('/edit/1')
    instance.app.mount({ children: [] })
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      Object.defineProperty(event, 'returnValue', { value: '', writable: true })
      browser.dispatchEvent(event)
      return event.defaultPrevented
    }
    assert.equal(unload(), false)
    instance.form.name = 'Alterado'
    assert.equal(unload(), true)
    instance.busy = true
    assert.equal((await instance.router.push('/list')).type, 4)
    assert.equal(instance.busyWarnings, 1)
    assert.equal(instance.prompts, 0)
    instance.busy = false
    instance.confirmed = true
    await instance.router.push('/list')
    assert.equal(unload(), false)
  } finally {
    instance.app.unmount()
    globalThis.window = previousWindow
  }
})
