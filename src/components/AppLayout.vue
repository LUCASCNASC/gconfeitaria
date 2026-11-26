<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authUser, logout } from '../services/auth.js'
import { userNotice } from '../services/users.js'

const router = useRouter()
const menu = ref(null)
const error = ref('')
const signingOut = ref(false)
const notice = ref(userNotice.value)
userNotice.value = ''
let noticeTimer

function dismissNotice() {
  clearTimeout(noticeTimer)
  notice.value = ''
}

onMounted(() => {
  if (notice.value) noticeTimer = setTimeout(dismissNotice, 3000)
})
onUnmounted(() => clearTimeout(noticeTimer))

function openMenu() {
  error.value = ''
  menu.value?.showModal()
}

function closeMenu() {
  menu.value?.close()
}

async function signOut() {
  error.value = ''
  signingOut.value = true
  try {
    await logout()
    closeMenu()
    await router.push({ name: 'login' })
  } catch (logoutError) {
    error.value = logoutError.message
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <button class="menu-button" type="button" aria-label="Abrir menu" aria-haspopup="dialog" @click="openMenu">
        <span aria-hidden="true">☰</span>
      </button>
      <RouterLink class="brand" :to="{ name: 'dashboard' }">
        <span class="brand-mark">g<span>.</span></span>
        <span class="brand-name">g confeitaria<small>feito com carinho</small></span>
      </RouterLink>
    </header>

    <dialog ref="menu" class="side-menu" aria-label="Menu de navegação" @keydown.esc.prevent="closeMenu">
      <div class="side-menu-content">
        <div class="side-menu-header">
          <div class="brand">
            <span class="brand-mark">g<span>.</span></span>
            <span class="brand-name">g confeitaria<small>feito com carinho</small></span>
          </div>
          <button class="menu-close" type="button" aria-label="Fechar menu" @click="closeMenu">×</button>
        </div>

        <p class="side-menu-label">MENU PRINCIPAL</p>
        <nav class="side-menu-nav" aria-label="Navegação principal">
          <RouterLink v-if="authUser" :to="{ name: 'user-edit', params: { id: authUser.id } }" @click="closeMenu">
            <span aria-hidden="true">♙</span> Minha conta
          </RouterLink>
          <RouterLink :to="{ name: 'dashboard' }" @click="closeMenu">
            <span aria-hidden="true">⌂</span> Dashboard
          </RouterLink>
          <RouterLink v-if="authUser?.role === 'ADMIN'" :to="{ name: 'users' }" @click="closeMenu">
            <span aria-hidden="true">＋</span> Cadastrar usuário
          </RouterLink>
        </nav>

        <div class="side-menu-bottom">
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="side-menu-logout" type="button" :disabled="signingOut" @click="signOut">
            <span aria-hidden="true">↪</span> {{ signingOut ? 'Saindo...' : 'Sair' }}
          </button>
        </div>
      </div>
    </dialog>

    <div v-if="notice" class="success-toast">
      <p role="status">{{ notice }}</p>
      <button type="button" aria-label="Fechar mensagem de sucesso" @click="dismissNotice">×</button>
    </div>
    <slot />
  </div>
</template>
