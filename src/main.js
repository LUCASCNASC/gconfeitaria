import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import UserCreateView from './views/UserCreateView.vue'
import UsersView from './views/UsersView.vue'
import UserEditView from './views/UserEditView.vue'
import { authError, getCurrentUser } from './services/auth.js'
import './style.css'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'login', component: LoginView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/usuarios', name: 'users', component: UsersView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/usuarios/novo', name: 'user-create', component: UserCreateView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/usuarios/:id/editar', name: 'user-edit', component: UserEditView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  try {
    const user = await getCurrentUser()
    if (!user) return { name: 'login' }
    if (user.role !== 'ADMIN' &&
        (to.meta.requiresAdmin || (to.name === 'user-edit' && to.params.id !== String(user.id)))) {
      return { name: 'dashboard' }
    }
  } catch (error) {
    authError.value = error.message
    return { name: 'login' }
  }
})

createApp(App).use(router).mount('#app')
