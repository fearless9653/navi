<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { BaseInput, BaseButton } from '@/components/atoms';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const currentPassword = ref('');
const newPassword = ref('');
const error = ref('');
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  busy.value = true;
  try {
    await auth.changePassword(currentPassword.value, newPassword.value);
    void router.push({ name: 'home' });
  } catch {
    error.value = t('auth.changePasswordFailed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="ui-bg ui-text grid min-h-screen place-items-center px-4">
    <form class="w-full max-w-sm space-y-4 rounded-xl p-6 ui-surface" @submit.prevent="submit">
      <h1 class="text-xl font-semibold">{{ t('auth.changePassword') }}</h1>
      <p v-if="auth.user?.mustChangePassword" class="text-sm ui-status-warning">
        {{ t('auth.mustChange') }}
      </p>
      <BaseInput
        v-model="currentPassword"
        type="password"
        :label="t('auth.currentPassword')"
        required
      />
      <BaseInput
        v-model="newPassword"
        type="password"
        :label="t('auth.newPassword')"
        required
        minlength="8"
      />
      <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>
      <BaseButton type="submit" block :loading="busy">{{ t('common.save') }}</BaseButton>
    </form>
  </div>
</template>
