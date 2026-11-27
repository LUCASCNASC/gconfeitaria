<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges.js'
import { request } from '../services/api.js'
import { addressErrors, applyCepAddress, clientNotice, formatCpf, formatTelephone, personalErrors } from '../services/clients.js'

const route = useRoute()
const router = useRouter()
const editing = computed(() => route.name === 'client-edit')
const listLocation = computed(() => ({ name: 'clients', query: route.query.pagina ? { pagina: route.query.pagina } : {} }))
const form = reactive({
  name: '', social_name: '', birth_date: '', sex_id: '', sexual_orientation_id: '',
  cpf: '', telefone: '', email: '', addresses: [], marketing_consent: false,
})
const initialMarketingConsent = ref(undefined)
const sexOptions = ref([])
const orientationOptions = ref([])
const step = ref(1)
const loading = ref(true)
const ready = ref(false)
const submitting = ref(false)
const deleting = ref(false)
const error = ref('')
const validation = reactive({ personal: {}, addresses: [] })
const lookups = reactive({})
const controllers = new Map()
const lookupPending = computed(() => Object.values(lookups).some((lookup) => lookup.loading))
const deleteDialog = ref(null)
const deleteError = ref('')
let nextAddressKey = 0
let loadVersion = 0

const { dialog: unsavedDialog, markSaved, dirty } = useUnsavedChanges(() => JSON.stringify(form), {
  isBusy: () => submitting.value || deleting.value,
  onBusy: () => { error.value = 'Aguarde a conclusão da operação.' },
})

const personalFields = [
  { key: 'name', label: 'Nome completo', required: true, max: 150 },
  { key: 'social_name', label: 'Nome social', max: 150 },
  { key: 'birth_date', label: 'Data de nascimento', required: true, type: 'date' },
  { key: 'sex_id', label: 'Sexo', required: true, options: sexOptions },
  { key: 'sexual_orientation_id', label: 'Orientação sexual', options: orientationOptions },
  { key: 'cpf', label: 'CPF', max: 14 },
  { key: 'telefone', label: 'Telefone / WhatsApp', required: true, max: 20, type: 'tel' },
  { key: 'email', label: 'E-mail', max: 255, type: 'email' },
]
const addressFields = [
  { key: 'cep', label: 'CEP', required: true, max: 9 },
  { key: 'city', label: 'Cidade', required: true, max: 100 },
  { key: 'state', label: 'Estado (sigla)', required: true, max: 2 },
  { key: 'street', label: 'Rua', required: true, max: 150 },
  { key: 'neighborhood', label: 'Bairro', required: true, max: 100 },
  { key: 'number', label: 'Número', required: true, max: 20 },
  { key: 'complement', label: 'Complemento', max: 100 },
  { key: 'reference_point', label: 'Ponto de referência', max: 200 },
]

function newAddress(data = {}) {
  const address = { key: ++nextAddressKey, cep: '', city: '', state: '', street: '', neighborhood: '', number: '', complement: '', reference_point: '' }
  for (const field of addressFields) address[field.key] = data[field.key] ?? ''
  if (data.id) address.id = data.id
  return address
}

function resetForm() {
  Object.assign(form, {
    name: '', social_name: '', birth_date: '', sex_id: '', sexual_orientation_id: '',
    cpf: '', telefone: '', email: '', addresses: [newAddress()], marketing_consent: false,
  })
  initialMarketingConsent.value = undefined
  validation.personal = {}
  validation.addresses = []
  step.value = 1
}

async function load() {
  const version = ++loadVersion
  loading.value = true
  ready.value = false
  error.value = ''
  for (const controller of controllers.values()) controller.abort()
  controllers.clear()
  for (const key of Object.keys(lookups)) delete lookups[key]
  resetForm()
  try {
    const [sex, orientations, result] = await Promise.all([
      request('/api/sex'),
      request('/api/sexual-orientations'),
      editing.value ? request(`/api/clients/${encodeURIComponent(route.params.id)}`) : Promise.resolve(null),
    ])
    if (version !== loadVersion) return
    sexOptions.value = sex.options
    orientationOptions.value = orientations.options
    if (result) {
      const client = result.client
      for (const field of personalFields) form[field.key] = client[field.key] ?? ''
      if (/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(form.cpf)) form.cpf = formatCpf(form.cpf)
      if (/^[\d\s().-]+$/.test(form.telefone) && [10, 11].includes(form.telefone.replace(/\D/g, '').length)) {
        form.telefone = formatTelephone(form.telefone)
      }
      form.addresses = client.addresses.length ? client.addresses.map(newAddress) : [newAddress()]
      form.marketing_consent = client.marketing_consent === true
      initialMarketingConsent.value = client.marketing_consent
    }
    markSaved()
    ready.value = true
  } catch (loadError) {
    if (version !== loadVersion) return
    error.value = loadError.message
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

function validatePersonal() {
  validation.personal = personalErrors(form)
  if (form.sex_id && !sexOptions.value.some((option) => option.id === form.sex_id)) validation.personal.sex_id = 'Selecione uma opção disponível.'
  if (form.sexual_orientation_id && !orientationOptions.value.some((option) => option.id === form.sexual_orientation_id)) validation.personal.sexual_orientation_id = 'Selecione uma opção disponível.'
  return !Object.keys(validation.personal).length
}

function formatPersonalInput(event, field) {
  const input = event.target
  const original = input.value
  const position = input.selectionStart
  const format = field === 'cpf' ? formatCpf : formatTelephone
  const formatted = format(original)
  form[field] = formatted
  input.value = formatted
  if (position === null || formatted === original) return
  const digitsBefore = original.slice(0, position).replace(/\D/g, '').length
  let newPosition = 0
  let seen = 0
  while (newPosition < formatted.length && seen < digitsBefore) {
    if (/\d/.test(formatted[newPosition])) seen++
    newPosition++
  }
  input.setSelectionRange(newPosition, newPosition)
}

function nextStep() {
  if (validatePersonal()) step.value = 2
}

function removeAddress(index) {
  if (form.addresses.length <= 1) return
  const [removed] = form.addresses.splice(index, 1)
  controllers.get(removed.key)?.abort()
  controllers.delete(removed.key)
  delete lookups[removed.key]
  validation.addresses.splice(index, 1)
}

async function lookupCep(address) {
  controllers.get(address.key)?.abort()
  controllers.delete(address.key)
  delete lookups[address.key]
  if (!/^(?:\d{8}|\d{5}-\d{3})$/.test(address.cep.trim())) return
  const cep = address.cep.replace(/\D/g, '')
  const initialAddress = { ...address }
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 10000)
  controllers.set(address.key, controller)
  lookups[address.key] = { loading: true, error: '' }
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw new Error('Não foi possível consultar o CEP. Preencha o endereço manualmente.')
    const data = await response.json()
    if (data.erro) throw new Error('CEP não encontrado. Confira-o ou preencha o endereço manualmente.')
    if (controller.signal.aborted || address.cep.replace(/\D/g, '') !== cep) return
    if (typeof data.localidade !== 'string' || typeof data.uf !== 'string') throw new Error('Resposta de CEP inválida. Preencha o endereço manualmente.')
    applyCepAddress(address, data, initialAddress)
    lookups[address.key] = { loading: false, error: '' }
  } catch (lookupError) {
    if (timedOut && controllers.get(address.key) === controller) {
      lookups[address.key] = { loading: false, error: 'A consulta de CEP demorou demais. Preencha o endereço manualmente.' }
    } else if (!controller.signal.aborted) {
      lookups[address.key] = { loading: false, error: lookupError.message || 'Falha ao consultar o CEP. Preencha o endereço manualmente.' }
    }
  } finally {
    clearTimeout(timeout)
    if (controllers.get(address.key) === controller) controllers.delete(address.key)
  }
}

function payload() {
  const data = Object.fromEntries(personalFields.map((field) => [field.key, form[field.key]]))
  data.addresses = form.addresses.map((address) => {
    const result = Object.fromEntries(addressFields.map((field) => [field.key, address[field.key]]))
    if (address.id) result.id = address.id
    return result
  })
  if (!editing.value || form.marketing_consent !== (initialMarketingConsent.value === true)) {
    data.marketing_consent = form.marketing_consent
  }
  return data
}

async function save() {
  error.value = ''
  if (!validatePersonal()) {
    step.value = 1
    return
  }
  validation.addresses = form.addresses.map(addressErrors)
  if (validation.addresses.some((errors) => Object.keys(errors).length)) return
  if (lookupPending.value) {
    error.value = 'Aguarde a conclusão da consulta de CEP.'
    return
  }
  submitting.value = true
  try {
    const path = editing.value ? `/api/clients/${encodeURIComponent(route.params.id)}` : '/api/clients'
    await request(path, { method: editing.value ? 'PUT' : 'POST', body: JSON.stringify(payload()) })
    markSaved()
    submitting.value = false
    clientNotice.value = editing.value ? 'Cliente editado com sucesso.' : 'Cliente cadastrado com sucesso.'
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

async function deleteClient() {
  deleteError.value = ''
  deleting.value = true
  try {
    await request(`/api/clients/${encodeURIComponent(route.params.id)}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    markSaved()
    deleting.value = false
    clientNotice.value = 'Cliente excluído com sucesso.'
    await router.push(listLocation.value)
  } catch (deleteFailure) {
    deleteError.value = deleteFailure.message
  } finally {
    deleting.value = false
  }
}

watch(() => [route.name, route.params.id], load, { immediate: true })
onBeforeUnmount(() => {
  loadVersion++
  for (const controller of controllers.values()) controller.abort()
})
</script>

<template>
  <AppLayout>
    <main class="dashboard-main">
      <p class="eyebrow">GERENCIAMENTO DE CLIENTES</p>
      <h1>{{ editing ? 'Editar cliente' : 'Cadastrar cliente' }}</h1>
      <p class="subtitle">Etapa {{ step }} de 2 · {{ step === 1 ? 'Dados pessoais' : 'Endereços e consentimento opcional' }}</p>
      <p v-if="loading" role="status">Carregando cadastro...</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button v-if="error && !ready && !loading" class="retry-button" type="button" @click="load">Tentar novamente</button>
      <form v-if="!loading && ready" class="user-form" novalidate @submit.prevent="step === 1 ? nextStep() : save()">
        <fieldset class="user-form-fields" :disabled="submitting || deleting">
          <template v-if="step === 1">
            <h2>Dados pessoais</h2>
            <p v-if="!sexOptions.length" class="form-error" role="alert">Nenhuma opção de sexo está disponível para o cadastro.</p>
            <template v-for="field in personalFields" :key="field.key">
              <label :for="`client-${field.key}`">{{ field.label }}{{ field.required ? ' *' : '' }}</label>
              <select v-if="field.options" :id="`client-${field.key}`" v-model="form[field.key]" :required="field.required" :aria-invalid="!!validation.personal[field.key]" :aria-describedby="validation.personal[field.key] ? `client-${field.key}-error` : undefined">
                <option value="">{{ field.required ? 'Selecione uma opção' : 'Não informado' }}</option>
                <option v-for="option in field.options.value" :key="option.id" :value="option.id">{{ option.name }}</option>
              </select>
              <input v-else-if="field.key === 'cpf' || field.key === 'telefone'" :id="`client-${field.key}`" :value="form[field.key]" :type="field.type || 'text'" inputmode="numeric" :maxlength="field.max" :required="field.required" :aria-invalid="!!validation.personal[field.key]" :aria-describedby="validation.personal[field.key] ? `client-${field.key}-error` : undefined" @input="formatPersonalInput($event, field.key)" />
              <input v-else :id="`client-${field.key}`" v-model="form[field.key]" :type="field.type || 'text'" :maxlength="field.max" :required="field.required" :aria-invalid="!!validation.personal[field.key]" :aria-describedby="validation.personal[field.key] ? `client-${field.key}-error` : undefined" />
              <p v-if="validation.personal[field.key]" :id="`client-${field.key}-error`" class="field-error">{{ validation.personal[field.key] }}</p>
            </template>
            <button class="primary-button complete-button" type="submit">Próxima etapa</button>
          </template>
          <template v-else>
            <h2>Endereços</h2>
            <section v-for="(address, index) in form.addresses" :key="address.key" class="client-address" :aria-labelledby="`address-heading-${address.key}`">
              <h3 :id="`address-heading-${address.key}`">Endereço {{ index + 1 }}</h3>
              <template v-for="field in addressFields" :key="field.key">
                <label :for="`address-${address.key}-${field.key}`">{{ field.label }}{{ field.required ? ' *' : '' }}</label>
                <input :id="`address-${address.key}-${field.key}`" v-model="address[field.key]" :maxlength="field.max" :required="field.required" :aria-invalid="!!validation.addresses[index]?.[field.key]" :aria-describedby="validation.addresses[index]?.[field.key] ? `address-${address.key}-${field.key}-error` : undefined" @input="field.key === 'cep' && lookupCep(address)" />
                <p v-if="validation.addresses[index]?.[field.key]" :id="`address-${address.key}-${field.key}-error`" class="field-error">{{ validation.addresses[index][field.key] }}</p>
                <p v-if="field.key === 'cep' && lookups[address.key]?.loading" role="status" class="prototype-note">Consultando CEP...</p>
                <p v-if="field.key === 'cep' && lookups[address.key]?.error" class="field-error" role="alert">{{ lookups[address.key].error }}</p>
              </template>
              <button v-if="form.addresses.length > 1" class="retry-button" type="button" @click="removeAddress(index)">Remover endereço {{ index + 1 }}</button>
            </section>
            <button class="retry-button" type="button" @click="form.addresses.push(newAddress())">＋ Adicionar endereço</button>
            <label class="active-control consent-control">
              <input v-model="form.marketing_consent" type="checkbox" />
              <span>O cliente autorizou receber promoções e novidades por WhatsApp ou e-mail (opcional).</span>
            </label>
            <p class="prototype-note">Marque somente com autorização do cliente. Desmarcar e salvar registra a retirada da autorização.</p>
            <button class="primary-button complete-button" type="submit" :disabled="submitting || lookupPending">{{ submitting ? 'Salvando...' : editing ? 'Concluir edição' : 'Concluir cadastro' }}</button>
            <button class="cancel-button client-back-button" type="button" @click="step = 1">Voltar para dados pessoais</button>
          </template>
          <button v-if="editing" class="delete-user-button client-delete-button" type="button" @click="deleteError = ''; deleteDialog?.showModal()">Deletar cliente</button>
        </fieldset>
      </form>
      <dialog v-if="editing && !loading && ready" ref="deleteDialog" class="confirm-dialog" aria-labelledby="delete-client-title" @cancel.prevent="closeDeleteDialog">
        <h2 id="delete-client-title">Confirmar exclusão</h2>
        <p>Deseja excluir o cliente <strong>{{ form.name }}</strong>? Ele não aparecerá mais na lista.</p>
        <p v-if="dirty()">As alterações não salvas também serão perdidas.</p>
        <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="cancel-button" :disabled="deleting" autofocus @click="closeDeleteDialog">Cancelar</button>
          <button type="button" class="delete-user-button" :disabled="deleting" @click="deleteClient">{{ deleting ? 'Excluindo...' : 'Confirmar exclusão' }}</button>
        </div>
      </dialog>
      <RouterLink class="back-link" :to="listLocation">← Voltar para clientes</RouterLink>
      <UnsavedChangesDialog ref="unsavedDialog" />
    </main>
  </AppLayout>
</template>
