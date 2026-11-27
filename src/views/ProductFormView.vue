<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges.js'
import { apiUrl, request } from '../services/api.js'
import { catalogNotice } from '../services/catalog.js'
import { MAX_PRODUCT_PHOTO_BYTES, normalizePrice } from '../services/product-validation.js'

const route = useRoute()
const router = useRouter()
const editing = computed(() => route.name === 'product-edit')
const listLocation = computed(() => ({ name: 'products', query: route.query.pagina ? { pagina: route.query.pagina } : {} }))
const form = reactive({ name: '', code: '', description: '', sale_price: '', cost_price: '', category_id: '', menu_ids: [], is_active: true })
const menus = ref([])
const categories = ref([])
const unavailableMenus = ref([])
const unavailableCategory = ref(null)
const menuOptions = computed(() => [...menus.value, ...unavailableMenus.value])
const selectedMenus = computed(() => form.menu_ids.map((id) => menuOptions.value.find((menu) => menu.id === id)).filter(Boolean))
const availableMenus = computed(() => menus.value.filter((menu) => !form.menu_ids.includes(menu.id)))
const categoryOptions = computed(() => unavailableCategory.value ? [...categories.value, unavailableCategory.value] : categories.value)
const loading = ref(true)
const ready = ref(false)
const submitting = ref(false)
const deleting = ref(false)
const error = ref('')
const validation = reactive({})
const photo = ref(undefined)
const hasStoredPhoto = ref(false)
const photoError = ref('')
const photoReading = ref(false)
const photoRevision = ref(0)
const photoPreview = computed(() => {
  if (typeof photo.value === 'string') return photo.value
  if (photo.value === null || !hasStoredPhoto.value) return ''
  return apiUrl(`/api/products/${encodeURIComponent(route.params.id)}/photo`)
})
const deleteDialog = ref(null)
const deleteError = ref('')
let loadVersion = 0
let photoReadVersion = 0

const { dialog: unsavedDialog, markSaved, dirty } = useUnsavedChanges(() => JSON.stringify({
  ...form, photo: photo.value === undefined ? 'unchanged' : photo.value === null ? 'removed' : photoRevision.value,
}), {
  isBusy: () => submitting.value || deleting.value || photoReading.value,
  onBusy: () => { error.value = 'Aguarde a conclusão da operação.' },
})

async function load() {
  const version = ++loadVersion
  loading.value = true
  ready.value = false
  error.value = ''
  photoReadVersion++
  photoReading.value = false
  photo.value = undefined
  hasStoredPhoto.value = false
  photoError.value = ''
  Object.keys(validation).forEach((key) => delete validation[key])
  Object.assign(form, { name: '', code: '', description: '', sale_price: '', cost_price: '', category_id: '', menu_ids: [], is_active: true })
  try {
    const [menuResult, categoryResult, productResult] = await Promise.all([
      request('/api/menus'),
      request('/api/categories'),
      editing.value ? request(`/api/products/${encodeURIComponent(route.params.id)}`) : Promise.resolve(null),
    ])
    if (version !== loadVersion) return
    menus.value = menuResult.menus
    categories.value = categoryResult.categories
    unavailableMenus.value = []
    unavailableCategory.value = null
    if (productResult) {
      const product = productResult.product
      hasStoredPhoto.value = product.has_photo
      Object.assign(form, {
        name: product.name, code: product.code ?? '', description: product.description ?? '',
        sale_price: product.sale_price, cost_price: product.cost_price, is_active: product.is_active,
        category_id: product.category_id ?? '', menu_ids: product.menus.map((menu) => menu.id),
      })
      unavailableMenus.value = product.menus.filter((menu) => !menus.value.some((option) => option.id === menu.id))
        .map((menu) => ({ ...menu, unavailable: true }))
      if (product.category_id && !categories.value.some((option) => option.id === product.category_id)) {
        unavailableCategory.value = { id: product.category_id, name: product.category_name || 'Categoria indisponível', unavailable: true }
      }
    }
    markSaved()
    ready.value = true
  } catch (loadError) {
    if (version === loadVersion) error.value = loadError.message
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

function validate() {
  Object.keys(validation).forEach((key) => delete validation[key])
  if (!form.name.trim()) validation.name = 'Campo obrigatório'
  for (const [field, label] of [['sale_price', 'Preço'], ['cost_price', 'Preço de custo']]) {
    if (!form[field].trim()) validation[field] = 'Campo obrigatório'
    else if (!normalizePrice(form[field])) validation[field] = `${label} deve ser maior que zero, com até duas casas decimais.`
  }
  if (!form.category_id) validation.category_id = 'Campo obrigatório'
  else if (!categories.value.some((category) => category.id === form.category_id)) validation.category_id = 'Selecione uma categoria disponível.'
  if (!form.menu_ids.length) validation.menu_ids = 'Selecione pelo menos um menu.'
  else if (form.menu_ids.length > 2 || form.menu_ids.some((id) => !menus.value.some((menu) => menu.id === id))) {
    validation.menu_ids = 'Selecione até dois menus disponíveis.'
  }
  if (photoError.value) validation.photo = photoError.value
  return !Object.keys(validation).length
}

async function selectPhoto(event) {
  const files = event.target.files
  if (!files.length) return
  const file = files[0]
  const fileCount = files.length
  event.target.value = ''
  const version = ++photoReadVersion
  photoReading.value = false
  photoError.value = ''
  delete validation.photo
  if (fileCount !== 1 || !/\.(jpe?g|png)$/i.test(file.name) || !['image/jpeg', 'image/png'].includes(file.type)) {
    photoError.value = 'Selecione uma única imagem JPEG ou PNG.'
    return
  }
  if (!file.size || file.size > MAX_PRODUCT_PHOTO_BYTES) {
    photoError.value = 'A foto deve ter até 3 MiB.'
    return
  }
  photoReading.value = true
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Não foi possível ler a foto. Tente novamente.'))
      reader.readAsDataURL(file)
    })
    const image = new Image()
    image.src = data
    try {
      await image.decode()
    } catch {
      throw new Error('A foto não é uma imagem válida. Selecione outro arquivo.')
    }
    if (version !== photoReadVersion) return
    photoRevision.value++
    photo.value = data
  } catch (readError) {
    if (version === photoReadVersion) photoError.value = readError.message
  } finally {
    if (version === photoReadVersion) photoReading.value = false
  }
}

function removePhoto() {
  photoReadVersion++
  photoReading.value = false
  photo.value = hasStoredPhoto.value ? null : undefined
  photoError.value = ''
  delete validation.photo
}

function dismissPhotoError() {
  photoError.value = ''
  delete validation.photo
}

function addMenu(event) {
  const id = event.target.value
  if (form.menu_ids.length < 2 && availableMenus.value.some((menu) => menu.id === id)) {
    form.menu_ids.push(id)
  }
  event.target.value = ''
}

function removeMenu(id) {
  form.menu_ids = form.menu_ids.filter((menuId) => menuId !== id)
}

async function save() {
  error.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    const path = editing.value ? `/api/products/${encodeURIComponent(route.params.id)}` : '/api/products'
    await request(path, { method: editing.value ? 'PUT' : 'POST', body: JSON.stringify({ ...form, photo: photo.value }) })
    markSaved()
    submitting.value = false
    catalogNotice.value = editing.value ? 'Produto editado com sucesso.' : 'Produto cadastrado com sucesso.'
    await router.push(listLocation.value)
  } catch (saveError) {
    error.value = saveError.message
  } finally {
    submitting.value = false
  }
}

function closeDeleteDialog() {
  if (!deleting.value) deleteDialog.value?.close()
}

async function deleteProduct() {
  deleteError.value = ''
  deleting.value = true
  try {
    await request(`/api/products/${encodeURIComponent(route.params.id)}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    markSaved()
    deleting.value = false
    catalogNotice.value = 'Produto excluído com sucesso.'
    await router.push(listLocation.value)
  } catch (deleteFailure) {
    deleteError.value = deleteFailure.message
  } finally {
    deleting.value = false
  }
}

watch(() => [route.name, route.params.id], load, { immediate: true })
onBeforeUnmount(() => { loadVersion++; photoReadVersion++ })
</script>

<template>
  <AppLayout>
    <main class="dashboard-main">
      <p class="eyebrow">GERENCIAMENTO DE PRODUTOS</p>
      <h1>{{ editing ? 'Editar produto' : 'Cadastrar produto' }}</h1>
      <p class="subtitle">{{ editing ? 'Atualize os dados do produto.' : 'Preencha os dados para adicionar um novo produto.' }}</p>
      <p v-if="loading" role="status">Carregando produto...</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button v-if="error && !ready && !loading" class="retry-button" type="button" @click="load">Tentar novamente</button>
      <form v-if="!loading && ready" class="user-form" novalidate @submit.prevent="save">
        <fieldset class="user-form-fields" :disabled="submitting || deleting || photoReading">
          <label for="product-name">Nome *</label>
          <input id="product-name" v-model="form.name" maxlength="150" required :aria-invalid="!!validation.name" :aria-describedby="validation.name ? 'product-name-error' : undefined" />
          <p v-if="validation.name" id="product-name-error" class="field-error">{{ validation.name }}</p>
          <label for="product-description">Descrição</label>
          <textarea id="product-description" v-model="form.description" class="catalog-description" rows="3"></textarea>
          <label for="product-code">Código</label>
          <input id="product-code" v-model="form.code" maxlength="50" />
          <label for="product-sale-price">Preço *</label>
          <input id="product-sale-price" v-model="form.sale_price" inputmode="decimal" required :aria-invalid="!!validation.sale_price" :aria-describedby="validation.sale_price ? 'product-sale-price-error' : undefined" />
          <p v-if="validation.sale_price" id="product-sale-price-error" class="field-error">{{ validation.sale_price }}</p>
          <label for="product-cost-price">Preço de custo *</label>
          <input id="product-cost-price" v-model="form.cost_price" inputmode="decimal" required :aria-invalid="!!validation.cost_price" :aria-describedby="validation.cost_price ? 'product-cost-price-error' : undefined" />
          <p v-if="validation.cost_price" id="product-cost-price-error" class="field-error">{{ validation.cost_price }}</p>
          <label for="product-category">Categoria *</label>
          <select id="product-category" v-model="form.category_id" required :aria-invalid="!!validation.category_id" :aria-describedby="validation.category_id ? 'product-category-error' : undefined">
            <option value="">Selecione uma categoria</option>
            <option v-for="category in categoryOptions" :key="category.id" :value="category.id" :disabled="category.unavailable">{{ category.name }}{{ category.unavailable ? ' (excluída)' : category.is_active ? '' : ' (inativa)' }}</option>
          </select>
          <p v-if="validation.category_id" id="product-category-error" class="field-error">{{ validation.category_id }}</p>
          <label for="product-menus">Menus *</label>
          <select id="product-menus" :disabled="form.menu_ids.length >= 2 || !availableMenus.length" :aria-invalid="!!validation.menu_ids" :aria-describedby="validation.menu_ids ? 'product-menus-help product-menus-error' : 'product-menus-help'" @change="addMenu">
            <option value="">{{ form.menu_ids.length >= 2 ? 'Limite de dois menus atingido' : availableMenus.length ? 'Selecione um menu para adicionar' : 'Nenhum menu disponível' }}</option>
            <option v-for="menu in availableMenus" :key="menu.id" :value="menu.id">{{ menu.name }}{{ menu.is_active ? '' : ' (inativo)' }}</option>
          </select>
          <p id="product-menus-help" class="product-menus-help">Selecione de um a dois menus.</p>
          <ul v-if="selectedMenus.length" class="selected-product-menus" aria-label="Menus selecionados">
            <li v-for="menu in selectedMenus" :key="menu.id">
              <span>{{ menu.name }}{{ menu.unavailable ? ' (excluído)' : menu.is_active ? '' : ' (inativo)' }}</span>
              <button type="button" :aria-label="`Remover ${menu.name}`" @click="removeMenu(menu.id)">×</button>
            </li>
          </ul>
          <p v-if="validation.menu_ids" id="product-menus-error" class="field-error">{{ validation.menu_ids }}</p>
          <label for="product-photo">Foto do produto</label>
          <input id="product-photo" type="file" accept=".jpeg,.jpg,.png,image/jpeg,image/png" :aria-invalid="!!(photoError || validation.photo)" aria-describedby="product-photo-help product-photo-error" @change="selectPhoto" />
          <p id="product-photo-help" class="product-menus-help">Uma foto em JPEG, JPG ou PNG, de até 3 MiB.</p>
          <p v-if="photoReading" role="status">Carregando foto...</p>
          <p id="product-photo-error" class="field-error" role="alert">{{ photoError || validation.photo }}</p>
          <button v-if="photoError" type="button" class="photo-error-dismiss" @click="dismissPhotoError">Descartar seleção inválida</button>
          <div v-if="photoPreview" class="product-photo-preview">
            <img :src="photoPreview" alt="Foto do produto" @error="photoError = 'Não foi possível exibir a foto. Selecione outra imagem.'" />
            <button type="button" class="cancel-button" @click="removePhoto">Remover foto</button>
          </div>
          <label class="active-control consent-control" for="product-active">
            <input id="product-active" v-model="form.is_active" type="checkbox" />
            <span>Ativo</span>
          </label>
          <button class="primary-button complete-button" type="submit">{{ submitting ? 'Salvando...' : editing ? 'Concluir edição' : 'Concluir cadastro' }}</button>
          <button v-if="editing" class="delete-user-button" type="button" @click="deleteError = ''; deleteDialog?.showModal()">Deletar produto</button>
        </fieldset>
      </form>
      <dialog v-if="editing && !loading && ready" ref="deleteDialog" class="confirm-dialog" aria-labelledby="delete-product-title" @cancel.prevent="closeDeleteDialog">
        <h2 id="delete-product-title">Confirmar exclusão</h2>
        <p>Deseja excluir o produto <strong>{{ form.name }}</strong>? Ele não aparecerá mais na lista.</p>
        <p v-if="dirty()">As alterações não salvas também serão perdidas.</p>
        <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="cancel-button" :disabled="deleting" autofocus @click="closeDeleteDialog">Cancelar</button>
          <button type="button" class="delete-user-button" :disabled="deleting" @click="deleteProduct">{{ deleting ? 'Excluindo...' : 'Confirmar exclusão' }}</button>
        </div>
      </dialog>
      <RouterLink class="back-link" :to="listLocation">← Voltar para produtos</RouterLink>
      <UnsavedChangesDialog ref="unsavedDialog" />
    </main>
  </AppLayout>
</template>
