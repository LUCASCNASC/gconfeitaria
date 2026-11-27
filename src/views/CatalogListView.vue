<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import { request } from '../services/api.js'

const props = defineProps({ config: { type: Object, required: true } })
const route = useRoute()
const router = useRouter()
const items = ref([])
const loading = ref(true)
const error = ref('')
let loadVersion = 0
const totalPages = computed(() => Math.max(1, Math.ceil(items.value.length / 15)))
const page = computed(() => {
  const requested = Number(route.query.pagina)
  return Math.min(totalPages.value, Number.isInteger(requested) && requested > 0 ? requested : 1)
})
const visibleItems = computed(() => items.value.slice((page.value - 1) * 15, page.value * 15))

async function loadItems() {
  const version = ++loadVersion
  loading.value = true
  error.value = ''
  try {
    const result = await request(props.config.api)
    if (version === loadVersion) items.value = result[props.config.collection]
  } catch (loadError) {
    if (version === loadVersion) error.value = loadError.message
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

function setPage(nextPage) {
  router.replace({ name: props.config.listRoute, query: { pagina: nextPage } })
}

watch(() => props.config, loadItems, { immediate: true })
onBeforeUnmount(() => { loadVersion++ })
</script>

<template>
  <AppLayout>
    <main class="dashboard-main users-main">
      <p class="eyebrow">GERENCIAMENTO DE {{ config.title.toUpperCase() }}</p>
      <div class="users-heading">
        <div>
          <h1>{{ config.title }}</h1>
          <p class="subtitle">Consulte e gerencie {{ config.article === 'o' ? 'os' : 'as' }} {{ config.plural }} {{ config.article === 'o' ? 'cadastrados' : 'cadastradas' }}.</p>
        </div>
        <RouterLink class="create-user-link" :to="{ name: config.createRoute }">＋ Cadastrar {{ config.singular }}</RouterLink>
      </div>
      <p v-if="loading" role="status">Carregando {{ config.plural }}...</p>
      <div v-else-if="error">
        <p class="form-error" role="alert">{{ error }}</p>
        <button class="retry-button" type="button" @click="loadItems">Tentar novamente</button>
      </div>
      <template v-else>
        <div class="grid-scroll" tabindex="0" role="region" :aria-label="`Lista de ${config.plural}`">
          <table class="users-grid clients-grid">
            <thead><tr><th scope="col">Nome</th><th scope="col">Descrição</th><th scope="col">Data de criação</th><th scope="col">Ativo</th><th scope="col">Ações</th></tr></thead>
            <tbody>
              <tr v-for="item in visibleItems" :key="item.id">
                <td :title="item.name">{{ item.name }}</td>
                <td :title="item.description">{{ item.description || '—' }}</td>
                <td>{{ new Date(item.created_at).toLocaleDateString('pt-BR') }}</td>
                <td><span class="user-status" :class="{ 'user-status-inactive': !item.is_active }">{{ item.is_active ? 'Ativo' : 'Desativado' }}</span></td>
                <td><RouterLink class="edit-user-link" :to="{ name: config.editRoute, params: { id: item.id }, query: { pagina: page } }" :aria-label="`Editar ${item.name}`">Editar</RouterLink></td>
              </tr>
              <tr v-if="items.length === 0"><td colspan="5" class="grid-empty">{{ config.empty }}</td></tr>
            </tbody>
          </table>
        </div>
        <nav class="pagination" :aria-label="`Paginação de ${config.plural}`">
          <span>{{ items.length }} {{ items.length === 1 ? config.singular : config.plural }} · Página {{ page }} de {{ totalPages }}</span>
          <div>
            <button type="button" :disabled="page === 1" @click="setPage(page - 1)">Anterior</button>
            <button type="button" :disabled="page === totalPages" @click="setPage(page + 1)">Próxima</button>
          </div>
        </nav>
      </template>
    </main>
  </AppLayout>
</template>
