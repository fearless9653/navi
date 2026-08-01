<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ListToolbar } from '@/components/molecules';
import EngineEditModal from '@/components/manage/EngineEditModal.vue';
import { BaseBadge, Favicon } from '@/components/atoms';
import { useEnginesStore } from '@/stores/engines';
import { useConfirm } from '@/composables/useConfirm';
import { useDragReorder } from '@/composables/useDragReorder';
import type { Engine } from '@/api/types';

const { t } = useI18n();
const store = useEnginesStore();
const { confirm } = useConfirm();
const modalOpen = ref(false);
const editing = ref<Engine | null>(null);

const { dragIndex, overIndex, onPointerDown } = useDragReorder((from, to) => {
  const ids = store.engines.map((e) => e.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved!);
  void store.reorder(ids); // 乐观更新 + 失败回滚在 store 内
});

function openNew(): void {
  editing.value = null;
  modalOpen.value = true;
}
function openEdit(e: Engine): void {
  editing.value = e;
  modalOpen.value = true;
}
async function remove(e: Engine): Promise<void> {
  if (!(await confirm({ message: t('manage.confirmDelete') }))) return;
  await store.remove(e.id);
}

onMounted(() => void store.load());
</script>

<template>
  <div class="space-y-4">
    <ListToolbar @new="openNew" />

    <ul class="rounded-lg ui-surface-translucent">
      <li
        v-for="(e, idx) in store.engines"
        :key="e.id"
        :data-drag-index="idx"
        class="ui-row-hover flex items-center justify-between border-b ui-divider px-3 py-2 text-sm first:rounded-t-lg last:rounded-b-lg last:border-0"
        :class="{
          'opacity-40': dragIndex === idx,
          'ui-active': overIndex === idx && dragIndex !== null && dragIndex !== idx,
        }"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span
            class="-ml-1 flex h-7 w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center ui-text-faint active:cursor-grabbing"
            :aria-label="t('common.dragToReorder')"
            :title="t('common.dragToReorder')"
            @pointerdown="onPointerDown(idx, $event)"
            >⠿</span
          >
          <Favicon :src="e.iconUrl" class="shrink-0" />
          <span class="min-w-0">
            <span class="font-medium">{{ e.name }}</span>
            <BaseBadge v-if="e.isDefault" variant="primary" size="xs" class="ml-2">{{
              t('admin.default')
            }}</BaseBadge>
            <span class="block truncate text-xs ui-text-faint">{{ e.urlTemplate }}</span>
          </span>
        </span>
        <span class="flex shrink-0 gap-3">
          <button v-if="!e.isDefault" class="ui-link" @click="store.setDefault(e.id)">
            {{ t('admin.setDefault') }}
          </button>
          <button class="ui-link" @click="openEdit(e)">
            {{ t('common.edit') }}
          </button>
          <button class="ui-link-danger" @click="remove(e)">
            {{ t('common.delete') }}
          </button>
        </span>
      </li>
      <li v-if="!store.engines.length" class="px-3 py-8 text-center ui-text-faint">
        {{ t('common.empty') }}
      </li>
    </ul>
  </div>

  <EngineEditModal
    v-if="modalOpen"
    :engine="editing"
    @saved="modalOpen = false"
    @close="modalOpen = false"
  />
</template>
