<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges.js'
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
const deleting = ref(false)
const deleteDialog = ref(null)
const deleteError = ref('')
const error = ref('')
let loadVersion = 0
const ownAccount = computed(() => user.value && user.value.id === authUser.value?.id)
const listLocation = computed(() => authUser.value?.role === 'ADMIN'
  ? { name: 'users', query: { pagina: route.query.pagina || 1 } }
  : { name: 'dashboard' })
const { dialog: unsavedDialog, markSaved, dirty } = useUnsavedChanges(() => JSON.stringify({ form, passwordForm }), {
  isBusy: () => submitting.value || deleting.value,
  onBusy: () => { error.value = 'Aguarde a conclusão da operação.' },
})

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
    markSaved()
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
    markSaved()
    submitting.value = false
    await router.push(listLocation.value)
  } catch (saveError) {
    error.value = saveError.message
  } finally {
    submitting.value = false
  }
}

function openDeleteDialog() {
  deleteError.value = ''
  deleteDialog.value?.showModal()
}

function closeDeleteDialog() {
  if (!deleting.value) deleteDialog.value?.close()
}

async function deleteUser() {
  deleteError.value = ''
  deleting.value = true
  try {
    await request(`/api/users/${encodeURIComponent(route.params.id)}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    markSaved()
    userNotice.value = 'Usuário excluído com sucesso.'
    deleting.value = false
    await router.push(listLocation.value)
  } catch (deleteFailure) {
    deleteError.value = deleteFailure.message
  } finally {
    deleting.value = false
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
        <fieldset class="user-form-fields" :disabled="submitting || deleting">
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
          <input id="edit-password" v-model="passwordForm.password" type="password" autocomplete="new-password" minlength="12" maxlength="255" required />
          <label for="edit-confirm-password">Confirmar nova senha</label>
          <input id="edit-confirm-password" v-model="passwordForm.confirm_password" type="password" autocomplete="new-password" maxlength="255" required />
          <p class="prototype-note">A nova senha deve ter pelo menos 12 caracteres.</p>
        </template>
        <button class="primary-button" :class="{ 'complete-button': !ownAccount }" type="submit" :disabled="submitting || (!ownAccount && types.length === 0)">{{ submitting ? 'Salvando...' : ownAccount ? 'Alterar senha' : 'Concluir edição' }}</button>
        <button v-if="!ownAccount && authUser?.role === 'ADMIN'" class="delete-user-button" type="button" :disabled="submitting" @click="openDeleteDialog">Deletar usuário</button>
        </fieldset>
      </form>
      <dialog v-if="user && !loading && !ownAccount && authUser?.role === 'ADMIN'" ref="deleteDialog" class="confirm-dialog" aria-labelledby="delete-user-title" aria-describedby="delete-user-description" @cancel.prevent="closeDeleteDialog">
        <h2 id="delete-user-title">Confirmar exclusão</h2>
        <p id="delete-user-description">Deseja excluir o usuário <strong>{{ user.name }}</strong>? Ele não aparecerá mais na lista.</p>
        <p v-if="dirty()">As alterações não salvas também serão perdidas.</p>
        <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="cancel-button" :disabled="deleting" autofocus @click="closeDeleteDialog">Cancelar</button>
          <button type="button" class="delete-user-button" :disabled="deleting" @click="deleteUser">{{ deleting ? 'Excluindo...' : 'Confirmar exclusão' }}</button>
        </div>
      </dialog>
      <button v-if="error && !user && !loading" class="retry-button" type="button" @click="loadUser">Tentar novamente</button>
      <RouterLink class="back-link" :to="listLocation">{{ authUser?.role === 'ADMIN' ? '← Voltar para usuários' : '← Voltar para o dashboard' }}</RouterLink>
      <UnsavedChangesDialog ref="unsavedDialog" />
    </main>
  </AppLayout>
</template>
