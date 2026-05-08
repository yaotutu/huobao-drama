<template>
  <div v-if="!authenticated" class="password-screen">
    <div class="password-card">
      <div class="password-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h1 class="password-title">火宝短剧</h1>
      <p class="password-desc">请输入访问密码</p>
      <form @submit.prevent="checkPassword" class="password-form">
        <input
          v-model="inputPwd"
          type="password"
          class="input password-input"
          placeholder="请输入密码"
          autofocus
        />
        <p v-if="error" class="password-error">{{ error }}</p>
        <button type="submit" class="btn btn-primary" style="width:100%">
          进入
        </button>
      </form>
    </div>
  </div>

  <template v-else>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster position="top-right" :duration="3000" />
  </template>
</template>

<script setup>
import { Toaster } from 'vue-sonner'

const APP_PASSWORD = 'redhat' // TODO: 上线前改成更复杂的密码

const authenticated = ref(false)
const inputPwd = ref('')
const error = ref('')

function checkPassword() {
  if (inputPwd.value === APP_PASSWORD) {
    sessionStorage.setItem('hb_auth', '1')
    authenticated.value = true
    error.value = ''
  } else {
    error.value = '密码错误，请重试'
    inputPwd.value = ''
  }
}

onMounted(() => {
  if (sessionStorage.getItem('hb_auth') === '1') {
    authenticated.value = true
  }
})
</script>

<style scoped>
.password-screen {
  position: fixed;
  inset: 0;
  background: var(--bg-1, #0f0f0f);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.password-card {
  background: var(--bg-2, #1a1a1a);
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 16px;
  padding: 40px 36px;
  width: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.password-icon {
  width: 60px; height: 60px;
  border-radius: 16px;
  background: var(--accent-bg, rgba(200,150,50,0.1));
  color: var(--accent, #c89632);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
}
.password-title {
  font-family: var(--font-display, system-ui);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-0, #f0f0f0);
}
.password-desc {
  font-size: 13px;
  color: var(--text-3, #888);
  margin-bottom: 8px;
}
.password-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.password-input {
  width: 100%;
  text-align: center;
  font-size: 15px;
  padding: 10px 16px;
}
.password-error {
  font-size: 12px;
  color: var(--error, #e5534b);
  text-align: center;
  margin: 0;
}
</style>

<style>
@import url('./assets/studio.css');
</style>
