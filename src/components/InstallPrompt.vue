<script setup>
import { onUnmounted, ref } from 'vue'

const deferredPrompt = ref(null)
const dismissed = ref(false)
const instructions = ref(false)
const error = ref('')
const standalone = ref(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function onBeforeInstall(event) {
  if (!window.matchMedia('(max-width: 760px)').matches) return
  event.preventDefault()
  deferredPrompt.value = event
}

function onInstalled() {
  standalone.value = true
  deferredPrompt.value = null
}

window.addEventListener('beforeinstallprompt', onBeforeInstall)
window.addEventListener('appinstalled', onInstalled)
onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
})

async function install() {
  error.value = ''
  if (isIos) {
    instructions.value = !instructions.value
    return
  }
  const prompt = deferredPrompt.value
  if (!prompt) return
  deferredPrompt.value = null
  try {
    await prompt.prompt()
  } catch (installError) {
    console.error('Não foi possível abrir a instalação:', installError)
    error.value = 'Não foi possível abrir a instalação. Use o menu do navegador para adicionar à tela inicial.'
  }
}
</script>

<template>
  <aside v-if="!standalone && !dismissed && (isIos || deferredPrompt || error)" class="install-prompt" aria-label="Instalar G Confeitaria">
    <button class="install-prompt-close" type="button" aria-label="Fechar opção de instalação" @click="dismissed = true">×</button>
    <p>Adicione a G Confeitaria à tela inicial do seu celular.</p>
    <button v-if="!error" class="install-prompt-button" type="button" @click="install">
      {{ isIos ? 'Como adicionar' : 'Adicionar à tela inicial' }}
    </button>
    <p v-if="instructions">No navegador, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </aside>
</template>
