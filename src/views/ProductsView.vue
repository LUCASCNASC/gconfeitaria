<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import { apiUrl, request } from '../services/api.js'

const route = useRoute()
const router = useRouter()
const products = ref([])
const loading = ref(true)
const error = ref('')
const photoDialog = ref(null)
const photoProduct = ref(null)
const photoLoading = ref(false)
const photoError = ref(false)
const totalPages = computed(() => Math.max(1, Math.ceil(products.value.length / 15)))
const page = computed(() => {
  const requested = Number(route.query.pagina)
  return Math.min(totalPages.value, Number.isInteger(requested) && requested > 0 ? requested : 1)
})
const visibleProducts = computed(() => products.value.slice((page.value - 1) * 15, page.value * 15))
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

async function loadProducts() {
  loading.value = true
  error.value = ''
  try {
    products.value = (await request('/api/products')).products
  } catch (loadError) {
    error.value = loadError.message
  } finally {
    loading.value = false
  }
}

function setPage(nextPage) {
  router.replace({ name: 'products', query: { pagina: nextPage } })
}

async function showPhoto(product) {
  photoProduct.value = product
  photoLoading.value = true
  photoError.value = false
  await nextTick()
  photoDialog.value?.showModal()
}

onMounted(loadProducts)
</script>

<template>
  <AppLayout>
    <main class="dashboard-main users-main">
      <p class="eyebrow">GERENCIAMENTO DE PRODUTOS</p>
      <div class="users-heading">
        <div>
          <h1>Produtos</h1>
          <p class="subtitle">Consulte e gerencie os produtos cadastrados.</p>
        </div>
        <RouterLink class="create-user-link" :to="{ name: 'product-create' }">＋ Cadastrar produto</RouterLink>
      </div>
      <p v-if="loading" role="status">Carregando produtos...</p>
      <div v-else-if="error">
        <p class="form-error" role="alert">{{ error }}</p>
        <button class="retry-button" type="button" @click="loadProducts">Tentar novamente</button>
      </div>
      <template v-else>
        <div class="grid-scroll" tabindex="0" role="region" aria-label="Lista de produtos">
          <table class="users-grid products-grid">
            <thead><tr><th scope="col">Nome</th><th scope="col">Imagem</th><th scope="col">Preço</th><th scope="col">Preço de custo</th><th scope="col">Descrição</th><th scope="col">Ativo</th><th scope="col">Menus</th><th scope="col">Categoria</th><th scope="col">Data de criação</th><th scope="col">Ações</th></tr></thead>
            <tbody>
              <tr v-for="product in visibleProducts" :key="product.id">
                <td :title="product.name">{{ product.name }}</td>
                <td><button v-if="product.has_photo" type="button" class="product-photo-link" :aria-label="`Ver imagem de ${product.name}`" @click="showPhoto(product)">Ver imagem</button><span v-else>Sem imagem</span></td>
                <td>{{ currency.format(Number(product.sale_price)) }}</td>
                <td>{{ currency.format(Number(product.cost_price)) }}</td>
                <td :title="product.description">{{ product.description || '—' }}</td>
                <td><span class="user-status" :class="{ 'user-status-inactive': !product.is_active }">{{ product.is_active ? 'Ativo' : 'Desativado' }}</span></td>
                <td><span v-for="menu in product.menus" :key="menu.id" class="product-menu-name" :title="menu.name">{{ menu.name }}</span><span v-if="!product.menus.length">—</span></td>
                <td :title="product.category_name">{{ product.category_name || '—' }}</td>
                <td>{{ new Date(product.created_at).toLocaleDateString('pt-BR') }}</td>
                <td><RouterLink class="edit-user-link" :to="{ name: 'product-edit', params: { id: product.id }, query: { pagina: page } }" :aria-label="`Editar ${product.name}`">Editar</RouterLink></td>
              </tr>
              <tr v-if="products.length === 0"><td colspan="10" class="grid-empty">Nenhum produto cadastrado.</td></tr>
            </tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="Paginação de produtos">
          <span>{{ products.length }} {{ products.length === 1 ? 'produto' : 'produtos' }} · Página {{ page }} de {{ totalPages }}</span>
          <div>
            <button type="button" :disabled="page === 1" @click="setPage(page - 1)">Anterior</button>
            <button type="button" :disabled="page === totalPages" @click="setPage(page + 1)">Próxima</button>
          </div>
        </nav>
      </template>
      <dialog ref="photoDialog" class="confirm-dialog product-photo-dialog" aria-labelledby="product-photo-title" @close="photoProduct = null">
        <template v-if="photoProduct">
          <h2 id="product-photo-title">Imagem: {{ photoProduct.name }}</h2>
          <p v-if="photoLoading" role="status">Carregando imagem...</p>
          <p v-if="photoError" class="form-error" role="alert">Não foi possível carregar a imagem.</p>
          <img v-show="!photoLoading && !photoError" :src="apiUrl(`/api/products/${encodeURIComponent(photoProduct.id)}/photo`)" :alt="`Imagem de ${photoProduct.name}`" @load="photoLoading = false" @error="photoLoading = false; photoError = true" />
          <div class="confirm-dialog-actions">
            <button type="button" class="cancel-button" autofocus @click="photoDialog?.close()">Fechar</button>
          </div>
        </template>
      </dialog>
    </main>
  </AppLayout>
</template>
