import { ref } from 'vue'
import { request } from './api.js'

export const authUser = ref(null)
export const authError = ref('')

export async function login(username, password) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  authUser.value = result.user
  return result.user
}

export async function getCurrentUser() {
  const result = await request('/api/auth/me')
  authUser.value = result.user
  return result.user
}

export async function logout() {
  await request('/api/auth/logout', { method: 'POST' })
  authUser.value = null
}
