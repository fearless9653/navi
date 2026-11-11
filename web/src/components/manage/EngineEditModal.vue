<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { BaseInput, BaseCheckbox, BaseSelect, Favicon } from '@/components/atoms';
import { ApiException } from '@/api/client';
import type { Engine, SuggestSource } from '@/api/types';
import { useEnginesStore } from '@/stores/engines';
import { asLimitError } from '@/lib/limitError';

type SuggestChoice = 'none' | SuggestSource;

const props = defineProps<{ engine: Engine | null }>();
const emit = defineEmits<{ saved: []; close: [] }>();
const { t } = useI18n();
const store = useEnginesStore();

const name = ref(props.engine?.name ?? '');
const urlTemplate = ref(props.engine?.urlTemplate ?? 'https://example.com/search?q={query}');
const iconUrl = ref(props.engine?.iconUrl ?? '');
const isDefault = ref(props.engine?.isDefault ?? false);
const suggestSource = ref<SuggestChoice>(
  props.engine?.suggestSource === 'google' || props.engine?.suggestSource === 'baidu'
    ? props.engine.suggestSource
    : 'none',
);
const busy = ref(false);
const error = ref('');

const suggestOptions = computed<{ value: SuggestChoice; label: string }[]>(() => [
  { value: 'none', label: t('admin.suggestSourceNone') },
  { value: 'google', label: t('admin.suggestSourceGoogle') },
  { value: 'baidu', label: t('admin.suggestSourceBaidu') },
]);

async function save(): Promise<void> {
  if (!name.value.trim() || !urlTemplate.value.trim()) return;
  if (!urlTemplate.value.includes('{query}')) {
    error.value = t('admin.urlTemplate');
    return;
  }
  busy.value = true;
  error.value = '';
  const payload = {
    name: name.value.trim(),
    urlTemplate: urlTemplate.value.trim(),
    iconUrl: iconUrl.value.trim() || null,
    isDefault: isDefault.value,
    suggestSource: suggestSource.value === 'none' ? null : suggestSource.value,
  };
  try {
    if (props.engine) await store.update(props.engine.id, payload);
    else await store.create(payload);
    emit('saved');
  } catch (e) {
    const limit = asLimitError(e);
    if (limit) error.value = t(`limits.${limit.resource}`, { limit: limit.limit });
    else error.value = e instanceof ApiException ? t('admin.urlTemplate') : 'error';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal
    :title="engine ? t('admin.editEngine') : t('admin.newEngine')"
    :busy="busy"
    @submit="save"
    @close="emit('close')"
  >
    <BaseInput v-model="name" :label="t('manage.name')" required />
    <BaseInput v-model="urlTemplate" :label="t('admin.urlTemplate')" required />
    <BaseInput v-model="iconUrl" :label="t('admin.iconUrl')">
      <template v-if="iconUrl" #append>
        <Favicon :src="iconUrl" size="h-5 w-5" />
      </template>
    </BaseInput>
    <div class="suggest-field">
      <label class="suggest-field__label" for="engine-suggest-source">{{
        t('admin.suggestSource')
      }}</label>
      <BaseSelect
        id="engine-suggest-source"
        v-model="suggestSource"
        block
        :options="suggestOptions"
      />
      <p class="suggest-field__hint">{{ t('admin.suggestSourceHint') }}</p>
    </div>
    <BaseCheckbox v-model="isDefault">{{ t('admin.setDefault') }}</BaseCheckbox>
    <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>
  </BaseModal>
</template>

<style scoped>
.suggest-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}
.suggest-field__label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}
.suggest-field__hint {
  font-size: 0.75rem;
  color: var(--color-text-faint, var(--color-text-secondary));
}
</style>
