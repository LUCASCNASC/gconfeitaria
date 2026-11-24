<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import { request } from '../services/api.js'
import { authUser } from '../services/auth.js'
import { userNotice } from '../services/users.js'

const route = useRoute()
const router = useRouter()
const user = ref(null)
const types = ref([])
const form = reactive({ email: '', role: '', is_active: true })
const passwordForm = reactive({ password: '', confirm_password: '' })
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
let loadVersion = 0
const ownAccount = computed(() => user.value && user.value.id === authUser.value?.id)
const listLocation = computed(() => authUser.value?.role === 'ADMIN'
  ? { name: 'users', query: { pagina: route.query.pagina || 1 } }
  : { name: 'dashboard' })

async function loadUser() {
  const version = ++loadVersion
  const id = route.params.id
  loading.value = true
  error.value = ''
  user.value = null
  Object.assign(passwordForm, { password: '', confirm_password: '' })
  try {
    const result = await request(`/api/users/${encodeURIComponent(id)}`)
    if (version !== loadVersion) return
    user.value = result.user
    if (!ownAccount.value) {
      const typesResult = await request('/api/user-types')
      if (version !== loadVersion) return
      types.value = typesResult.user_types
    }
    const currentType = types.value.find((type) => type.id === result.user.role_id)
    Object.assign(form, { email: result.user.email, role: currentType?.id ?? '', is_active: result.user.is_active })
  } catch (loadError) {
    if (version !== loadVersion) return
    user.value = null
    error.value = loadError.message
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

async function saveUser() {
  error.value = ''
  if (ownAccount.value && passwordForm.password !== passwordForm.confirm_password) {
    error.value = 'As senhas não coincidem.'
    return
  }
  submitting.value = true
  try {
    const path = `/api/users/${encodeURIComponent(route.params.id)}`
    if (ownAccount.value) {
      await request(`${path}/password`, { method: 'PATCH', body: JSON.stringify(passwordForm) })
      Object.assign(passwordForm, { password: '', confirm_password: '' })
      userNotice.value = 'Senha alterada com sucesso.'
    } else {
      await request(path, { method: 'PUT', body: JSON.stringify(form) })
      userNotice.value = 'Usuário editado com sucesso.'
    }
    await router.push(listLocation.value)
  } catch (saveError) {
    error.value = saveError.message
  } finally {
    submitting.value = false
  }
}

watch(() => route.params.id, loadUser, { immediate: true })
</script>

<template>
  <AppLayout>
    <main class="dashboard-main">
      <p class="eyebrow">GERENCIAMENTO DE USUÁRIOS</p>
      <h1>{{ ownAccount ? 'Visualizar usuário' : 'Editar usuário' }}</h1>
      <p class="subtitle">{{ ownAccount ? 'Consulte seu cadastro ou altere sua senha.' : 'Atualize o e-mail, o tipo e a situação do usuário.' }}</p>
      <p v-if="loading" role="status">Carregando usuário...</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <form v-if="user && !loading" class="user-form" @submit.prevent="saveUser">
        <label for="edit-name">Nome</label>
        <input id="edit-name" :value="user.name" readonly />
        <label for="edit-username">Usuário</label>
        <input id="edit-username" :value="user.username" readonly />
        <label for="edit-email">E-mail</label>
        <input id="edit-email" v-model="form.email" type="email" maxlength="255" required :readonly="ownAccount" />
        <label for="edit-role">Tipo de usuário</label>
        <input v-if="ownAccount" id="edit-role" :value="user.role" readonly />
        <select v-else id="edit-role" v-model="form.role" required :disabled="types.length === 0">
          <option value="" disabled>Selecione um tipo</option>
          <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option>
        </select>
        <p v-if="!ownAccount && !form.role" class="form-error">O tipo atual não está disponível. Selecione um tipo ativo.</p>
        <label class="active-control" for="edit-active">
          <input id="edit-active" v-model="form.is_active" type="checkbox" :disabled="ownAccount" />
          Usuário ativo
        </label>
        <template v-if="ownAccount">
          <label for="edit-password">Nova senha</label>
          <input id="edit-password" v-model="passwordForm.password" type="password" autocomplete="new-password" maxlength="255" required />
          <label for="edit-confirm-password">Confirmar nova senha</label>
          <input id="edit-confirm-password" v-model="passwordForm.confirm_password" type="password" autocomplete="new-password" maxlength="255" required />
        </template>
        <button class="primary-button" type="submit" :disabled="submitting || (!ownAccount && types.length === 0)">{{ submitting ? 'Salvando...' : ownAccount ? 'Alterar senha' : 'Concluir edição' }}</button>
      </form>
      <button v-if="error && !user && !loading" class="retry-button" type="button" @click="loadUser">Tentar novamente</button>
      <RouterLink class="back-link" :to="listLocation">{{ authUser?.role === 'ADMIN' ? '← Voltar para usuários' : '← Voltar para o dashboard' }}</RouterLink>
    </main>
  </AppLayout>
</template>
