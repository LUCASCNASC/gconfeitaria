<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import { request } from '../services/api.js'

const route = useRoute()
const router = useRouter()
const clients = ref([])
const loading = ref(true)
const error = ref('')
const totalPages = computed(() => Math.max(1, Math.ceil(clients.value.length / 15)))
const page = computed(() => {
  const requested = Number(route.query.pagina)
  return Math.min(totalPages.value, Number.isInteger(requested) && requested > 0 ? requested : 1)
})
const visibleClients = computed(() => clients.value.slice((page.value - 1) * 15, page.value * 15))

async function loadClients() {
  loading.value = true
  error.value = ''
  try {
    clients.value = (await request('/api/clients')).clients
  } catch (loadError) {
    error.value = loadError.message
  } finally {
    loading.value = false
  }
}

function setPage(nextPage) {
  router.replace({ name: 'clients', query: { pagina: nextPage } })
}

onMounted(loadClients)
</script>

<template>
  <AppLayout>
    <main class="dashboard-main users-main">
      <p class="eyebrow">GERENCIAMENTO DE CLIENTES</p>
      <div class="users-heading">
        <div>
          <h1>Clientes</h1>
          <p class="subtitle">Consulte e gerencie os clientes cadastrados.</p>
        </div>
        <RouterLink class="create-user-link" :to="{ name: 'client-create' }">＋ Cadastrar cliente</RouterLink>
      </div>
      <p v-if="loading" role="status">Carregando clientes...</p>
      <div v-else-if="error">
        <p class="form-error" role="alert">{{ error }}</p>
        <button class="retry-button" type="button" @click="loadClients">Tentar novamente</button>
      </div>
      <template v-else>
        <div class="grid-scroll" tabindex="0" role="region" aria-label="Lista de clientes">
          <table class="users-grid clients-grid">
            <thead><tr><th scope="col">Nome</th><th scope="col">Telefone / WhatsApp</th><th scope="col">E-mail</th><th scope="col">Cidade</th><th scope="col">Ações</th></tr></thead>
            <tbody>
              <tr v-for="client in visibleClients" :key="client.id">
                <td :title="client.name">{{ client.name }}</td>
                <td>{{ client.telefone || '—' }}</td>
                <td :title="client.email">{{ client.email || '—' }}</td>
                <td>{{ client.addresses[0]?.city || '—' }}</td>
                <td><RouterLink class="edit-user-link" :to="{ name: 'client-edit', params: { id: client.id }, query: { pagina: page } }" :aria-label="`Editar ${client.name}`">Editar</RouterLink></td>
              </tr>
              <tr v-if="clients.length === 0"><td colspan="5" class="grid-empty">Nenhum cliente cadastrado.</td></tr>
            </tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="Paginação de clientes">
          <span>{{ clients.length }} {{ clients.length === 1 ? 'cliente' : 'clientes' }} · Página {{ page }} de {{ totalPages }}</span>
          <div>
            <button type="button" :disabled="page === 1" @click="setPage(page - 1)">Anterior</button>
            <button type="button" :disabled="page === totalPages" @click="setPage(page + 1)">Próxima</button>
          </div>
        </nav>
      </template>
    </main>
  </AppLayout>
</template>
