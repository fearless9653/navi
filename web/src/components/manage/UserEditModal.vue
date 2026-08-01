<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { BaseInput, BaseCheckbox } from '@/components/atoms';
import { ApiException } from '@/api/client';
import type { PublicUser } from '@/api/types';
import { useAdminUsersStore } from '@/stores/adminUsers';

const props = defineProps<{ user: PublicUser | null }>();
const emit = defineEmits<{ saved: []; close: [] }>();
const { t } = useI18n();
const store = useAdminUsersStore();

const isNew = !props.user;
const email = ref(props.user?.email ?? '');
const displayName = ref(props.user?.displayName ?? '');
const password = ref('');
const isAdmin = ref(props.user?.isAdmin ?? false);
const isActive = ref(props.user?.isActive ?? true);
const busy = ref(false);
const error = ref('');

async function save(): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    if (props.user) {
      const patch: Record<string, unknown> = {
        displayName: displayName.value.trim(),
        isAdmin: isAdmin.value,
        isActive: isActive.value,
      };
      if (password.value) patch.newPassword = password.value;
      await store.update(props.user.id, patch);
    } else {
      await store.create({
        email: email.value.trim(),
        displayName: displayName.value.trim(),
        password: password.value,
        isAdmin: isAdmin.value,
      });
    }
    emit('saved');
  } catch (e) {
    const body = e instanceof ApiException ? (e.body as { error?: string } | null) : null;
    error.value = body?.error === 'last_admin' ? t('admin.lastAdmin') : (body?.error ?? 'error');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal
    :title="user ? t('admin.editUser') : t('admin.newUser')"
    :busy="busy"
    @submit="save"
    @close="emit('close')"
  >
    <BaseInput v-if="isNew" v-model="email" type="email" :label="t('auth.email')" required />
    <p v-else class="text-sm ui-text-faint">{{ email }}</p>
    <BaseInput v-model="displayName" :label="t('auth.displayName')" required />
    <BaseInput
      v-model="password"
      type="password"
      :label="isNew ? t('auth.password') : t('admin.resetPassword')"
      :required="isNew"
      minlength="8"
    />
    <BaseCheckbox v-model="isAdmin">{{ t('admin.isAdmin') }}</BaseCheckbox>
    <BaseCheckbox v-if="!isNew" v-model="isActive">{{ t('admin.active') }}</BaseCheckbox>
    <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>
  </BaseModal>
</template>
