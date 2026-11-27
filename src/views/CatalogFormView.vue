<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges.js'
import { request } from '../services/api.js'
import { catalogNotice } from '../services/catalog.js'

const props = defineProps({ config: { type: Object, required: true } })
const route = useRoute()
const router = useRouter()
const editing = computed(() => route.name === props.config.editRoute)
const listLocation = computed(() => ({ name: props.config.listRoute, query: route.query.pagina ? { pagina: route.query.pagina } : {} }))
const form = reactive({ name: '', description: '', is_active: true })
const loading = ref(true)
const ready = ref(false)
const submitting = ref(false)
const deleting = ref(false)
const error = ref('')
const nameError = ref('')
const deleteDialog = ref(null)
const deleteError = ref('')
let loadVersion = 0

const { dialog: unsavedDialog, markSaved, dirty } = useUnsavedChanges(() => JSON.stringify(form), {
  isBusy: () => submitting.value || deleting.value,
  onBusy: () => { error.value = 'Aguarde a conclusão da operação.' },
})

async function load() {
  const version = ++loadVersion
  loading.value = true
  ready.value = false
  error.value = ''
  nameError.value = ''
  Object.assign(form, { name: '', description: '', is_active: true })
  try {
    if (editing.value) {
      const result = await request(`${props.config.api}/${encodeURIComponent(route.params.id)}`)
      if (version !== loadVersion) return
      const item = result[props.config.key]
      Object.assign(form, { name: item.name, description: item.description ?? '', is_active: item.is_active })
    }
    markSaved()
    ready.value = true
  } catch (loadError) {
    if (version === loadVersion) error.value = loadError.message
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

async function save() {
  error.value = ''
  nameError.value = form.name.trim() ? '' : 'Campo obrigatório'
  if (nameError.value) return
  submitting.value = true
  try {
    const path = editing.value ? `${props.config.api}/${encodeURIComponent(route.params.id)}` : props.config.api
    await request(path, { method: editing.value ? 'PUT' : 'POST', body: JSON.stringify(form) })
    markSaved()
    submitting.value = false
    catalogNotice.value = editing.value ? props.config.edited : props.config.created
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

async function deleteItem() {
  deleteError.value = ''
  deleting.value = true
  try {
    await request(`${props.config.api}/${encodeURIComponent(route.params.id)}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    markSaved()
    deleting.value = false
    catalogNotice.value = props.config.deleted
    await router.push(listLocation.value)
  } catch (deleteFailure) {
    deleteError.value = deleteFailure.message
  } finally {
    deleting.value = false
  }
}

watch(() => [props.config, route.name, route.params.id], load, { immediate: true })
</script>

<template>
  <AppLayout>
    <main class="dashboard-main">
      <p class="eyebrow">GERENCIAMENTO DE {{ config.title.toUpperCase() }}</p>
      <h1>{{ editing ? 'Editar' : 'Cadastrar' }} {{ config.singular }}</h1>
      <p class="subtitle">{{ editing ? `Atualize os dados d${config.article} ${config.singular}.` : `Preencha os dados para adicionar um${config.article === 'a' ? 'a' : ''} nov${config.article} ${config.singular}.` }}</p>
      <p v-if="loading" role="status">Carregando {{ config.singular }}...</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button v-if="error && !ready && !loading" class="retry-button" type="button" @click="load">Tentar novamente</button>
      <form v-if="!loading && ready" class="user-form" novalidate @submit.prevent="save">
        <fieldset class="user-form-fields" :disabled="submitting || deleting">
          <label for="catalog-name">Nome *</label>
          <input id="catalog-name" v-model="form.name" :maxlength="config.nameMax" required :aria-invalid="!!nameError" :aria-describedby="nameError ? 'catalog-name-error' : undefined" />
          <p v-if="nameError" id="catalog-name-error" class="field-error">{{ nameError }}</p>
          <label for="catalog-description">Descrição</label>
          <textarea id="catalog-description" v-model="form.description" class="catalog-description" rows="3" :maxlength="config.descriptionMax"></textarea>
          <label class="active-control consent-control" for="catalog-active">
            <input id="catalog-active" v-model="form.is_active" type="checkbox" />
            <span>Ativo</span>
          </label>
          <button class="primary-button complete-button" type="submit">{{ submitting ? 'Salvando...' : editing ? 'Concluir edição' : 'Concluir cadastro' }}</button>
          <button v-if="editing" class="delete-user-button" type="button" @click="deleteError = ''; deleteDialog?.showModal()">Deletar {{ config.singular }}</button>
        </fieldset>
      </form>
      <dialog v-if="editing && !loading && ready" ref="deleteDialog" class="confirm-dialog" aria-labelledby="delete-menu-title" @cancel.prevent="closeDeleteDialog">
        <h2 id="delete-menu-title">Confirmar exclusão</h2>
        <p>Deseja excluir {{ config.article }} {{ config.singular }} <strong>{{ form.name }}</strong>? {{ config.article === 'o' ? 'Ele' : 'Ela' }} não aparecerá mais na lista.</p>
        <p v-if="dirty()">As alterações não salvas também serão perdidas.</p>
        <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="cancel-button" :disabled="deleting" autofocus @click="closeDeleteDialog">Cancelar</button>
          <button type="button" class="delete-user-button" :disabled="deleting" @click="deleteItem">{{ deleting ? 'Excluindo...' : 'Confirmar exclusão' }}</button>
        </div>
      </dialog>
      <RouterLink class="back-link" :to="listLocation">← Voltar para {{ config.plural }}</RouterLink>
      <UnsavedChangesDialog ref="unsavedDialog" />
    </main>
  </AppLayout>
</template>
