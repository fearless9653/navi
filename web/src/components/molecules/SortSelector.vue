<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { BaseButton, BaseSelect } from '@/components/atoms';

export interface SortOption {
  key: string;
  label: string;
}
export type SortDir = 'asc' | 'desc';

defineProps<{ options: SortOption[] }>();
const field = defineModel<string>('field', { required: true });
const dir = defineModel<SortDir>('dir', { required: true });

const { t } = useI18n();

function toggleDir(): void {
  dir.value = dir.value === 'asc' ? 'desc' : 'asc';
}
</script>

<template>
  <div class="flex items-center gap-2 text-sm">
    <BaseSelect
      v-model="field"
      size="sm"
      :options="options.map((opt) => ({ value: opt.key, label: opt.label }))"
    />
    <BaseButton
      variant="secondary"
      size="sm"
      icon-only
      class="ui-text-subtle"
      :title="dir === 'asc' ? t('common.sortAsc') : t('common.sortDesc')"
      @click="toggleDir"
    >
      {{ dir === 'asc' ? '↑' : '↓' }}
    </BaseButton>
  </div>
</template>
