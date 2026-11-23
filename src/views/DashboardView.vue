<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
const username = sessionStorage.getItem('gconfeitaria:username')

function logout() {
  sessionStorage.removeItem('gconfeitaria:username')
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="brand">
        <span class="brand-mark">g<span>.</span></span>
        <span class="brand-name">g confeitaria<small>feito com carinho</small></span>
      </div>
      <button class="logout-button" type="button" @click="logout">Sair <span aria-hidden="true">↗</span></button>
    </header>
    <main class="dashboard-main">
      <p class="eyebrow">SEU ESPAÇO DE GESTÃO</p>
      <h1>Olá, {{ username }} <span>♡</span></h1>
      <p class="subtitle">Que bom ter você por aqui.</p>
      <section class="dashboard-card">
        <span class="card-icon" aria-hidden="true">✳</span>
        <div>
          <h2>Bem-vinda à G Confeitaria</h2>
          <p>Este é o início do seu espaço de gestão. Em breve, você poderá organizar sua confeitaria por aqui.</p>
        </div>
      </section>
      <p class="prototype-note"><strong>Modo demonstração.</strong> O login é ilustrativo e não protege esta página ou seus dados.</p>
    </main>
  </div>
</template>
