<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')

function login() {
  if (!username.value.trim() || !password.value.trim()) {
    error.value = 'Informe um usuário e uma senha que não estejam em branco.'
    return
  }

  error.value = ''
  sessionStorage.setItem('gconfeitaria:username', username.value.trim())
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <main class="login-layout">
    <section class="welcome-panel" aria-label="Boas-vindas">
      <a class="brand brand-light" href="/" aria-label="G Confeitaria, início">
        <span class="brand-mark">g<span>.</span></span>
        <span class="brand-name">g confeitaria<small>feito com carinho</small></span>
      </a>

      <div class="welcome-copy">
        <p class="eyebrow eyebrow-light">UM ESPAÇO FEITO PARA VOCÊ</p>
        <h1>Doce é fazer o que a gente ama.</h1>
        <p>Um cantinho para organizar sua confeitaria e cuidar de cada detalhe com carinho.</p>
        <div class="illustration" aria-hidden="true">
          <span class="sparkle sparkle-one">✳</span>
          <span class="sparkle sparkle-two">✦</span>
          <svg viewBox="0 0 280 230" fill="none">
            <path d="M56 202h168M85 202l12-24h86l12 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
            <path d="M72 105c0-11 9-20 20-20h96c11 0 20 9 20 20v58c0 8-7 15-15 15H87c-8 0-15-7-15-15v-58Z" fill="#F3D0C8" stroke="currentColor" stroke-width="3" />
            <path d="M72 110c11 0 11 13 22 13s11-13 22-13 11 13 23 13 11-13 23-13 11 13 23 13 11-13 23-13" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
            <path d="M95 85c0-25 20-45 45-45s45 20 45 45" fill="#FBE8DE" stroke="currentColor" stroke-width="3" />
            <path d="M140 40V20m-7 5c0-5 7-11 7-11s7 6 7 11a7 7 0 0 1-14 0Z" fill="#F9DDA9" stroke="currentColor" stroke-width="3" />
            <path d="M99 147h82" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 13" />
          </svg>
        </div>
      </div>
      <p class="panel-footer">Pequenos detalhes, grandes momentos. ♡</p>
    </section>

    <section class="form-panel">
      <div class="mobile-brand"><span class="brand-mark">g<span>.</span></span> g confeitaria</div>
      <div class="login-card">
        <p class="eyebrow">BEM-VINDA DE VOLTA</p>
        <h2>Entre na sua conta</h2>
        <p class="subtitle">Acesse seu espaço de gestão.</p>

        <form @submit.prevent="login">
          <label for="username">Usuário</label>
          <input id="username" v-model="username" name="username" autocomplete="username" placeholder="Digite seu usuário" required />

          <label for="password">Senha</label>
          <div class="password-field">
            <input id="password" v-model="password" name="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Digite sua senha" required />
            <button type="button" class="password-toggle" :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'" @click="showPassword = !showPassword">
              {{ showPassword ? 'Ocultar' : 'Mostrar' }}
            </button>
          </div>

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="primary-button" type="submit">Entrar <span aria-hidden="true">→</span></button>
        </form>

        <p class="prototype-note"><strong>Modo demonstração.</strong> Informe qualquer usuário e senha não vazios. Este acesso não protege dados.</p>
      </div>
      <p class="form-footer">Feito com carinho para a sua confeitaria <span>♡</span></p>
    </section>
  </main>
</template>
