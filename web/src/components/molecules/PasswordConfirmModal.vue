<script setup lang="ts">
/**
 * PasswordConfirmModal — 敏感操作前的当前密码二次确认弹窗。
 * 受控组件：父组件负责发起校验并回传 busy/error；本组件只收集密码并 emit submit。
 * 父组件用 v-if 挂载/卸载本组件，故每次打开都是全新实例、密码初始为空，无需手动清空。
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { BaseInput } from '@/components/atoms';

defineProps<{ title: string; busy?: boolean; error?: string }>();
const emit = defineEmits<{ close: []; submit: [password: string] }>();

const { t } = useI18n();
const password = ref('');

function submit(): void {
  if (!password.value) return;
  emit('submit', password.value);
}
</script>

<template>
  <BaseModal
    :title="title"
    :busy="busy"
    :submit-label="t('common.confirm')"
    @close="emit('close')"
    @submit="submit"
  >
    <BaseInput
      v-model="password"
      type="password"
      :label="t('auth.currentPassword')"
      :error="error"
      required
      autofocus
    />
  </BaseModal>
</template>
