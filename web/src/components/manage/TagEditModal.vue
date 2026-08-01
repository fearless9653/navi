<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { BaseInput } from '@/components/atoms';
import TagCascadePicker from '@/components/tags/TagCascadePicker.vue';
import type { Tag } from '@/api/types';
import { useTagsStore } from '@/stores/tags';
import { asLimitError } from '@/lib/limitError';

const props = defineProps<{ tag: Tag | null }>();
const emit = defineEmits<{ saved: []; close: [] }>();
const { t } = useI18n();
const store = useTagsStore();

const name = ref(props.tag?.name ?? '');
const parentId = ref<number | null>(props.tag?.parentId ?? null);
const busy = ref(false);
const error = ref('');

// 单选模式：parentId (number | null) ↔ number[]
function onSelectChange(arr: number[]): void {
  parentId.value = arr[0] ?? null;
}

async function save(): Promise<void> {
  if (!name.value.trim()) return;
  busy.value = true;
  error.value = '';
  try {
    if (props.tag)
      await store.update(props.tag.id, { name: name.value.trim(), parentId: parentId.value });
    else await store.create(name.value.trim(), parentId.value);
    emit('saved');
  } catch (e) {
    const limit = asLimitError(e);
    error.value = limit
      ? t(`limits.${limit.resource}`, { limit: limit.limit })
      : (e as Error).message || 'error';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseModal
    :title="tag ? t('admin.editTag') : t('admin.newTag')"
    :busy="busy"
    @submit="save"
    @close="emit('close')"
  >
    <BaseInput v-model="name" :label="t('manage.name')" required />
    <label class="flex flex-col gap-1">
      <span class="ui-text-subtle text-sm">{{ t('admin.parent') }}</span>
      <TagCascadePicker
        :model-value="parentId != null ? [parentId] : []"
        :multiple="false"
        :exclude-ids="tag ? [tag.id] : []"
        @update:model-value="onSelectChange"
      />
    </label>
    <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>
  </BaseModal>
</template>
