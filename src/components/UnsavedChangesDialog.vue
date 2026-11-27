<script setup>
import { onBeforeUnmount, ref } from 'vue'

const dialog = ref(null)
let resolveConfirmation
let confirmation

function finish(confirmed) {
  if (!resolveConfirmation) return
  dialog.value?.close()
  resolveConfirmation(confirmed)
  resolveConfirmation = null
  confirmation = null
}

function confirm() {
  if (!confirmation) {
    confirmation = new Promise((resolve) => { resolveConfirmation = resolve })
    dialog.value.showModal()
  }
  return confirmation
}

onBeforeUnmount(() => finish(false))
defineExpose({ confirm })
</script>

<template>
  <dialog ref="dialog" class="confirm-dialog" aria-labelledby="unsaved-title" aria-describedby="unsaved-description" @cancel.prevent="finish(false)">
    <h2 id="unsaved-title">Descartar alterações?</h2>
    <p id="unsaved-description">Você tem dados não salvos. Se sair, perderá suas alterações.</p>
    <div class="confirm-dialog-actions">
      <button type="button" class="cancel-button" autofocus @click="finish(false)">Continuar editando</button>
      <button type="button" class="delete-user-button" @click="finish(true)">Sair sem salvar</button>
    </div>
  </dialog>
</template>
