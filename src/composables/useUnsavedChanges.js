import { onBeforeUnmount, provide, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

export function useUnsavedChanges(snapshot, { isBusy = () => false, onBusy = () => {} } = {}) {
  const dialog = ref(null)
  const baseline = ref(snapshot())
  const dirty = () => snapshot() !== baseline.value

  function beforeUnload(event) {
    event.preventDefault()
    event.returnValue = ''
  }

  const stop = watch(dirty, (hasChanges) => {
    if (hasChanges) window.addEventListener('beforeunload', beforeUnload)
    else window.removeEventListener('beforeunload', beforeUnload)
  }, { flush: 'sync' })

  function markSaved() {
    baseline.value = snapshot()
  }

  async function confirmLeave() {
    if (isBusy()) {
      onBusy()
      return false
    }
    if (!dirty()) return true
    return dialog.value ? dialog.value.confirm() : false
  }

  onBeforeRouteLeave(confirmLeave)
  onBeforeRouteUpdate((to, from) => to.path === from.path ? true : confirmLeave())
  provide('unsavedChanges', { confirmLeave, markSaved })

  onBeforeUnmount(() => {
    stop()
    window.removeEventListener('beforeunload', beforeUnload)
  })

  return { dialog, markSaved, dirty }
}
