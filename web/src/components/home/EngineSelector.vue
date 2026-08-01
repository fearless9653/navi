<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEnginesStore } from '@/stores/engines';
import { BaseListbox } from '@/components/molecules';
import { Favicon, BaseChevron } from '@/components/atoms';

const { t } = useI18n();
const engines = useEnginesStore();

// 引擎 id → 引擎，供 #trigger / #option 插槽取 favicon（ListboxOption 只承载 value/label）。
const byId = computed(() => new Map(engines.engines.map((e) => [e.id, e])));

const options = computed<{ value: number; label: string }[]>(() =>
  engines.engines.map((e) => ({ value: e.id, label: e.name })),
);

const model = computed({
  get: () => engines.currentId,
  set: (id: number | null) => {
    if (id != null) engines.select(id);
  },
});
</script>

<template>
  <BaseListbox
    v-model="model"
    :options="options"
    match-trigger-width
    :aria-label="t('common.selectEngine')"
    trigger-class="engine-trigger"
  >
    <template #trigger="{ selected, open }">
      <Favicon
        v-if="byId.get(selected?.value as number)?.iconUrl"
        :src="byId.get(selected?.value as number)!.iconUrl!"
        size="h-4 w-4"
        class="shrink-0"
      />
      <span class="flex-1 truncate text-left" :title="selected?.label">{{
        selected?.label ?? '—'
      }}</span>
      <BaseChevron :open="open" class="engine-caret shrink-0" />
    </template>

    <template #option="{ option }">
      <Favicon
        v-if="byId.get(option.value as number)?.iconUrl"
        :src="byId.get(option.value as number)!.iconUrl!"
        size="h-4 w-4"
      />
      <span class="truncate">{{ option.label }}</span>
    </template>
  </BaseListbox>
</template>

<style scoped>
/* 引擎触发器：沿用原生 select 时期的外观——占满搜索框左侧、右侧分隔线、无边框圆角。
   trigger-class 落在 BaseListbox 渲染的按钮上（非本组件根，故用 :deep 穿透）；
   本组件根（BaseDropdown 的 .dropdown）带本组件 scope id，:deep 得以命中该按钮。 */
:deep(.engine-trigger) {
  display: flex;
  height: 100%;
  width: 7rem;
  align-items: center;
  gap: var(--spacing-1-5);
  border-right: 1px solid var(--color-border);
  border-top-left-radius: 2rem;
  border-bottom-left-radius: 2rem;
  padding: var(--spacing-3);
  font-size: 0.875rem;
  color: var(--color-text-muted, var(--color-text-secondary));
}
:deep(.engine-trigger):hover {
  background-color: var(--color-row-hover);
}
/* 悬浮时保持分隔线中性：BaseListbox 默认会把触发器边框转 accent，但引擎触发器只有右侧分隔线，
   变蓝后成一条扎眼的强调色描边；背景变化已足够表达可交互，故覆盖回中性色。
   加 :not(:disabled) 使特异性(0,4,0)稳压 BaseListbox 的 hover 规则(0,3,0)。 */
:deep(.engine-trigger):not(:disabled):hover {
  border-color: var(--color-border);
}

/* caret 沿用触发器的弱化文字色，翻转由 BaseChevron 自身处理。 */
.engine-caret {
  opacity: 0.6;
}
</style>
