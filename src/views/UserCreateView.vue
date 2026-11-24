<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '../components/AppLayout.vue'
import { request } from '../services/api.js'
import { userNotice } from '../services/users.js'

const router = useRouter()
const form = reactive({ name: '', username: '', email: '', password: '', confirm_password: '', role: '' })
const error = ref('')
const submitting = ref(false)
const types = ref([])
const loadingTypes = ref(true)
const typesError = ref('')

async function loadTypes() {
  loadingTypes.value = true
  typesError.value = ''
  try {
    const result = await request('/api/user-types')
    types.value = result.user_types
    if (!types.value.some((type) => type.id === form.role)) form.role = ''
  } catch (loadError) {
    typesError.value = loadError.message
  } finally {
    loadingTypes.value = false
  }
}

onMounted(loadTypes)

async function createUser() {
  error.value = ''
  if (form.password !== form.confirm_password) {
    error.value = 'As senhas não coincidem.'
    return
  }
  submitting.value = true
  try {
    await request('/api/users', { method: 'POST', body: JSON.stringify(form) })
    userNotice.value = 'Usuário cadastrado com sucesso.'
    await router.push({ name: 'users' })
  } catch (createError) {
    error.value = createError.message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AppLayout>
    <main class="dashboard-main">
      <p class="eyebrow">GERENCIAMENTO DE USUÁRIOS</p>
      <h1>Cadastrar usuário</h1>
      <p class="subtitle">Preencha os dados para adicionar um novo usuário.</p>
      <form class="user-form" @submit.prevent="createUser">
        <label for="name">Nome</label>
        <input id="name" v-model="form.name" name="name" autocomplete="name" maxlength="150" required />
        <label for="new-username">Usuário</label>
        <input id="new-username" v-model="form.username" name="username" autocomplete="off" maxlength="50" required />
        <label for="email">E-mail</label>
        <input id="email" v-model="form.email" name="email" type="email" autocomplete="off" maxlength="255" required />
        <label for="new-password">Senha</label>
        <input id="new-password" v-model="form.password" name="password" type="password" autocomplete="new-password" maxlength="255" required />
        <label for="confirm-password">Confirmar senha</label>
        <input id="confirm-password" v-model="form.confirm_password" name="confirm_password" type="password" autocomplete="new-password" maxlength="255" required />
        <label for="role">Tipo de usuário</label>
        <select id="role" v-model="form.role" name="role" required :disabled="loadingTypes || !!typesError || types.length === 0">
          <option value="" disabled>{{ loadingTypes ? 'Carregando tipos...' : 'Selecione um tipo' }}</option>
          <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option>
        </select>
        <p v-if="typesError" class="form-error" role="alert">{{ typesError }}</p>
        <button v-if="typesError" class="retry-button" type="button" @click="loadTypes">Tentar carregar tipos novamente</button>
        <p v-else-if="!loadingTypes && types.length === 0" class="form-error" role="alert">Nenhum tipo de usuário disponível.</p>
        <p class="prototype-note">Novos usuários são cadastrados como ativos. Use apenas dados de teste: a senha é armazenada em texto puro nesta etapa.</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary-button" type="submit" :disabled="submitting || loadingTypes || !!typesError || types.length === 0">{{ submitting ? 'Cadastrando...' : 'Cadastrar usuário' }}</button>
      </form>
      <RouterLink class="back-link" :to="{ name: 'users' }">← Voltar para usuários</RouterLink>
    </main>
  </AppLayout>
</template>
