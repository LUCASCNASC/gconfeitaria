<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../services/auth.js'

const router = useRouter()
const menu = ref(null)
const error = ref('')
const signingOut = ref(false)

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
          <RouterLink :to="{ name: 'dashboard' }" @click="closeMenu">
            <span aria-hidden="true">⌂</span> Dashboard
          </RouterLink>
          <RouterLink :to="{ name: 'users' }" @click="closeMenu">
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

    <slot />
  </div>
</template>
