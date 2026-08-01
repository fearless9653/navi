<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { BaseInput, BaseButton } from '@/components/atoms';

const { t } = useI18n();
const auth = useAuthStore();
const currentPassword = ref('');
const newPassword = ref('');
const savedMsg = ref(false);
const error = ref('');
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  savedMsg.value = false;
  busy.value = true;
  try {
    await auth.changePassword(currentPassword.value, newPassword.value);
    savedMsg.value = true;
    currentPassword.value = '';
    newPassword.value = '';
  } catch {
    error.value = t('auth.changePasswordFailed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form
    data-test="account-surface"
    class="max-w-sm space-y-3 rounded-lg p-4 ui-surface-translucent shadow-sm sm:p-5"
    @submit.prevent="submit"
  >
    <p class="text-sm ui-text-subtle">{{ auth.user?.email }}</p>
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
    <div class="flex items-center gap-3">
      <BaseButton type="submit" size="sm" :loading="busy">{{ t('common.save') }}</BaseButton>
      <span v-if="savedMsg" class="text-sm ui-status-success">✓</span>
    </div>
  </form>
</template>
