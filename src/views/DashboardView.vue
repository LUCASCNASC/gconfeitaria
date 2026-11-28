<script setup>
import AppLayout from '../components/AppLayout.vue'
import { authUser } from '../services/auth.js'
</script>

<template>
  <AppLayout>
    <main class="dashboard-main">
      <p class="eyebrow">SEU ESPAÇO DE GESTÃO</p>
      <h1>Olá, {{ authUser?.username }} <span>♡</span></h1>
      <p class="subtitle">Que bom ter você por aqui.</p>
      <section class="dashboard-card">
        <span class="card-icon" aria-hidden="true">✳</span>
        <div>
          <h2>Bem-vindo à G Confeitaria</h2>
          <p>Este é o início do seu espaço de gestão. Em breve, você poderá organizar sua confeitaria por aqui.</p>
        </div>
      </section>
    </main>
  </AppLayout>
</template>
