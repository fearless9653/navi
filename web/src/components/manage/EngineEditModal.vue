<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { BaseInput, BaseCheckbox, Favicon } from '@/components/atoms';
import { ApiException } from '@/api/client';
import type { Engine } from '@/api/types';
import { useEnginesStore } from '@/stores/engines';
import { asLimitError } from '@/lib/limitError';

const props = defineProps<{ engine: Engine | null }>();
const emit = defineEmits<{ saved: []; close: [] }>();
const { t } = useI18n();
const store = useEnginesStore();

const name = ref(props.engine?.name ?? '');
const urlTemplate = ref(props.engine?.urlTemplate ?? 'https://example.com/search?q={query}');
const iconUrl = ref(props.engine?.iconUrl ?? '');
const isDefault = ref(props.engine?.isDefault ?? false);
const busy = ref(false);
const error = ref('');

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
    <BaseCheckbox v-model="isDefault">{{ t('admin.setDefault') }}</BaseCheckbox>
    <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>
  </BaseModal>
</template>
