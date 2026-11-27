import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import LoginView from './views/LoginView.vue'
import DashboardView from './views/DashboardView.vue'
import UserCreateView from './views/UserCreateView.vue'
import UsersView from './views/UsersView.vue'
import UserEditView from './views/UserEditView.vue'
import ClientsView from './views/ClientsView.vue'
import ClientFormView from './views/ClientFormView.vue'
import CatalogListView from './views/CatalogListView.vue'
import CatalogFormView from './views/CatalogFormView.vue'
import ProductsView from './views/ProductsView.vue'
import ProductFormView from './views/ProductFormView.vue'
import { authError, getCurrentUser } from './services/auth.js'
import { restoreRedirect } from './services/redirect.js'
import './style.css'

restoreRedirect(window)

const menuConfig = {
  api: '/api/menus', key: 'menu', collection: 'menus',
  listRoute: 'product-menus', createRoute: 'menu-create', editRoute: 'menu-edit',
  title: 'Menus', singular: 'menu', plural: 'menus', article: 'o', nameMax: 150, descriptionMax: 150,
  empty: 'Nenhum menu cadastrado.', created: 'Menu cadastrado com sucesso.',
  edited: 'Menu editado com sucesso.', deleted: 'Menu excluído com sucesso.',
}
const categoryConfig = {
  api: '/api/categories', key: 'category', collection: 'categories',
  listRoute: 'product-categories', createRoute: 'category-create', editRoute: 'category-edit',
  title: 'Categorias', singular: 'categoria', plural: 'categorias', article: 'a', nameMax: 100,
  empty: 'Nenhuma categoria cadastrada.', created: 'Categoria cadastrada com sucesso.',
  edited: 'Categoria editada com sucesso.', deleted: 'Categoria excluída com sucesso.',
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'login', component: LoginView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/usuarios', name: 'users', component: UsersView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/usuarios/novo', name: 'user-create', component: UserCreateView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/usuarios/:id/editar', name: 'user-edit', component: UserEditView, meta: { requiresAuth: true } },
    { path: '/clientes', name: 'clients', component: ClientsView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/clientes/novo', name: 'client-create', component: ClientFormView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/clientes/:id/editar', name: 'client-edit', component: ClientFormView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/produtos/cadastro', name: 'products', component: ProductsView, meta: { requiresAuth: true } },
    { path: '/produtos/cadastro/novo', name: 'product-create', component: ProductFormView, meta: { requiresAuth: true } },
    { path: '/produtos/cadastro/:id/editar', name: 'product-edit', component: ProductFormView, meta: { requiresAuth: true } },
    { path: '/produtos/categorias', name: 'product-categories', component: CatalogListView, props: { config: categoryConfig }, meta: { requiresAuth: true } },
    { path: '/produtos/categorias/novo', name: 'category-create', component: CatalogFormView, props: { config: categoryConfig }, meta: { requiresAuth: true } },
    { path: '/produtos/categorias/:id/editar', name: 'category-edit', component: CatalogFormView, props: { config: categoryConfig }, meta: { requiresAuth: true } },
    { path: '/produtos/menus', name: 'product-menus', component: CatalogListView, props: { config: menuConfig }, meta: { requiresAuth: true } },
    { path: '/produtos/menus/novo', name: 'menu-create', component: CatalogFormView, props: { config: menuConfig }, meta: { requiresAuth: true } },
    { path: '/produtos/menus/:id/editar', name: 'menu-edit', component: CatalogFormView, props: { config: menuConfig }, meta: { requiresAuth: true } },
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
