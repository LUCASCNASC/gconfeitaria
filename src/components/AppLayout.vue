<script setup>
import { inject, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authUser, logout } from '../services/auth.js'
import { userNotice } from '../services/users.js'
import { clientNotice } from '../services/clients.js'
import { catalogNotice } from '../services/catalog.js'

const router = useRouter()
const unsavedChanges = inject('unsavedChanges', null)
const menu = ref(null)
const error = ref('')
const signingOut = ref(false)
const notice = ref(userNotice.value || clientNotice.value || catalogNotice.value)
userNotice.value = ''
clientNotice.value = ''
catalogNotice.value = ''
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

function closeMenuOnBackdrop(event) {
  const bounds = event.currentTarget.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom) closeMenu()
}

async function signOut() {
  error.value = ''
  signingOut.value = true
  try {
    closeMenu()
    if (unsavedChanges && !await unsavedChanges.confirmLeave()) return
    await logout()
    unsavedChanges?.markSaved()
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

    <dialog ref="menu" class="side-menu" aria-label="Menu de navegação" @click.self="closeMenuOnBackdrop" @keydown.esc.prevent="closeMenu">
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
          <RouterLink v-if="authUser?.role === 'ADMIN'" :to="{ name: 'clients' }" @click="closeMenu">
            <span aria-hidden="true">♙</span> Clientes
          </RouterLink>
          <RouterLink v-if="authUser?.role === 'ADMIN'" :to="{ name: 'users' }" @click="closeMenu">
            <span aria-hidden="true">＋</span> Usuários
          </RouterLink>
          <details class="side-menu-group">
            <summary><span aria-hidden="true">◇</span> Produtos</summary>
            <div class="side-menu-submenu">
              <RouterLink :to="{ name: 'products' }" @click="closeMenu">Cadastro</RouterLink>
              <RouterLink :to="{ name: 'product-categories' }" @click="closeMenu">Categorias</RouterLink>
              <RouterLink :to="{ name: 'product-menus' }" @click="closeMenu">Menus</RouterLink>
            </div>
          </details>
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
