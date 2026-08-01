<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { BaseInput, BaseButton } from '@/components/atoms';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  busy.value = true;
  try {
    await auth.login(email.value, password.value);
    void router.push({ name: 'home' });
  } catch {
    error.value = t('auth.loginFailed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="ui-bg ui-text grid min-h-screen place-items-center px-4">
    <form class="w-full max-w-sm space-y-4 rounded-xl p-6 ui-surface" @submit.prevent="submit">
      <h1 class="text-xl font-semibold">{{ t('auth.login') }}</h1>
      <BaseInput v-model="email" type="email" :label="t('auth.email')" required />
      <BaseInput v-model="password" type="password" :label="t('auth.password')" required />
      <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>
      <BaseButton type="submit" block :loading="busy">{{ t('auth.login') }}</BaseButton>
    </form>
  </div>
</template>
