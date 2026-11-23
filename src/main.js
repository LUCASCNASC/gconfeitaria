import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import './style.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'login', component: LoginView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const username = sessionStorage.getItem('gconfeitaria:username')
  if (to.name === 'dashboard' && !username) return { name: 'login' }
  if (to.name === 'login' && username) return { name: 'dashboard' }
})

createApp(App).use(router).mount('#app')
