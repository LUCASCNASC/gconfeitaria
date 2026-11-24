<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import { request } from '../services/api.js'
import { authUser } from '../services/auth.js'

const route = useRoute()
const router = useRouter()
const users = ref([])
const loading = ref(true)
const error = ref('')

const columns = ref([
  { key: 'name', label: 'Nome', width: 180 },
  { key: 'username', label: 'Usuário', width: 160 },
  { key: 'email', label: 'E-mail', width: 240 },
  { key: 'role', label: 'Tipo de usuário', width: 180 },
  { key: 'is_active', label: 'Ativo', width: 140 },
  { key: 'actions', label: 'Ações', width: 120 },
])
const pageSize = 15
const totalPages = computed(() => Math.max(1, Math.ceil(users.value.length / pageSize)))
const page = computed(() => {
  const requested = Number(route.query.pagina)
  return Math.min(totalPages.value, Number.isInteger(requested) && requested > 0 ? requested : 1)
})
const visibleUsers = computed(() => users.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const tableWidth = computed(() => columns.value.reduce((sum, column) => sum + column.width, 0))
let resizing = null

async function loadUsers() {
  loading.value = true
  error.value = ''
  try {
    const result = await request('/api/users')
    users.value = result.users
  } catch (loadError) {
    error.value = loadError.message
  } finally {
    loading.value = false
  }
}

function setPage(nextPage) {
  router.replace({ name: 'users', query: { pagina: nextPage } })
}

function setWidth(column, width) {
  column.width = Math.max(100, Math.min(700, Math.round(width)))
}

function startResize(event, column) {
  if (event.button !== 0) return
  event.preventDefault()
  resizing = { column, startX: event.clientX, startWidth: column.width }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function moveResize(event) {
  if (resizing) setWidth(resizing.column, resizing.startWidth + event.clientX - resizing.startX)
}

function stopResize() {
  resizing = null
}

function resizeWithKeyboard(event, column) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  setWidth(column, column.width + (event.key === 'ArrowRight' ? 10 : -10))
}

onMounted(loadUsers)
</script>

<template>
  <AppLayout>
    <main class="dashboard-main users-main">
      <p class="eyebrow">GERENCIAMENTO DE USUÁRIOS</p>
      <div class="users-heading">
        <div>
          <h1>Usuários</h1>
          <p class="subtitle">Consulte e gerencie os usuários cadastrados.</p>
        </div>
        <RouterLink class="create-user-link" :to="{ name: 'user-create' }">＋ Cadastrar usuário</RouterLink>
      </div>

      <p v-if="loading" role="status">Carregando usuários...</p>
      <div v-else-if="error">
        <p class="form-error" role="alert">{{ error }}</p>
        <button class="retry-button" type="button" @click="loadUsers">Tentar novamente</button>
      </div>
      <template v-else>
        <div class="grid-scroll" tabindex="0" role="region" aria-label="Lista de usuários">
          <table class="users-grid" :style="{ width: `${tableWidth}px` }">
            <colgroup>
              <col v-for="column in columns" :key="column.key" :style="{ width: `${column.width}px` }" />
            </colgroup>
            <thead>
              <tr>
                <th v-for="column in columns" :key="column.key" scope="col">
                  {{ column.label }}
                  <span
                    class="column-resizer"
                    role="separator"
                    tabindex="0"
                    aria-orientation="vertical"
                    :aria-label="`Redimensionar coluna ${column.label}`"
                    :aria-valuenow="column.width"
                    aria-valuemin="100"
                    aria-valuemax="700"
                    @pointerdown="startResize($event, column)"
                    @pointermove="moveResize"
                    @pointerup="stopResize"
                    @pointercancel="stopResize"
                    @lostpointercapture="stopResize"
                    @keydown="resizeWithKeyboard($event, column)"
                  ></span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in visibleUsers" :key="user.id">
                <td :title="user.name">{{ user.name }}</td>
                <td :title="user.username">{{ user.username }}</td>
                <td :title="user.email">{{ user.email }}</td>
                <td :title="user.role">{{ user.role }}</td>
                <td><span class="user-status" :class="{ 'user-status-inactive': !user.is_active }">{{ user.is_active ? 'Ativo' : 'Desativado' }}</span></td>
                <td><RouterLink class="edit-user-link" :to="{ name: 'user-edit', params: { id: user.id }, query: { pagina: page } }" :aria-label="`${user.id === authUser?.id ? 'Visualizar' : 'Editar'} ${user.username}`">{{ user.id === authUser?.id ? 'Visualizar' : 'Editar' }}</RouterLink></td>
              </tr>
              <tr v-if="users.length === 0"><td colspan="6" class="grid-empty">Nenhum usuário cadastrado.</td></tr>
            </tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="Paginação de usuários">
          <span>{{ users.length }} {{ users.length === 1 ? 'usuário' : 'usuários' }} · Página {{ page }} de {{ totalPages }}</span>
          <div>
            <button type="button" :disabled="page === 1" @click="setPage(page - 1)">Anterior</button>
            <button type="button" :disabled="page === totalPages" @click="setPage(page + 1)">Próxima</button>
          </div>
        </nav>
      </template>
    </main>
  </AppLayout>
</template>
