<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { BaseButton, BaseInput } from '@/components/atoms';

defineProps<{ search?: boolean }>();
const emit = defineEmits<{ new: [] }>();
const query = defineModel<string>('query', { default: '' });
const { t } = useI18n();
</script>

<template>
  <div class="flex items-center gap-2 sm:gap-3">
    <BaseButton size="sm" class="shrink-0" @click="emit('new')">
      {{ t('common.add') }}
    </BaseButton>
    <BaseInput
      v-if="search"
      v-model="query"
      type="search"
      size="sm"
      class="w-full min-w-0 flex-1 sm:max-w-xs"
      :placeholder="t('common.search')"
    />
  </div>
</template>
