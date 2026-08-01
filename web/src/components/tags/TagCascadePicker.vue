<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Tag } from '@/api/types';
import { useTagsStore } from '@/stores/tags';

const props = withDefaults(
  defineProps<{
    searchable?: boolean;
    multiple?: boolean;
    excludeIds?: number[];
  }>(),
  {
    searchable: true,
    multiple: true,
    excludeIds: () => [],
  },
);

const selected = defineModel<number[]>({ default: () => [] });

const { t } = useI18n();
const tagsStore = useTagsStore();
const drillPath = ref<number[]>([]);
const search = ref('');
const searchResults = ref<Tag[]>([]);

const excludeSet = computed(() => new Set(props.excludeIds));

function filterExcluded(list: Tag[]): Tag[] {
  return excludeSet.value.size ? list.filter((tg) => !excludeSet.value.has(tg.id)) : list;
}

// Miller 列级联：全部列均从全量标签内存派生，无逐级请求
const columns = computed<Tag[][]>(() => {
  const cols: Tag[][] = [];

  // 第 0 列：根标签
  cols.push(filterExcluded(tagsStore.childrenOf(null)));

  // 后续列：根据 drillPath 展开
  for (const parentId of drillPath.value) {
    const children = tagsStore.childrenOf(parentId);
    if (children.length === 0) break;
    cols.push(filterExcluded(children));
  }

  return cols;
});

function isSelected(id: number): boolean {
  return selected.value.includes(id);
}
function toggle(id: number): void {
  if (props.multiple) {
    selected.value = isSelected(id)
      ? selected.value.filter((x) => x !== id)
      : [...selected.value, id];
    return;
  }
  // 单选：再次点击已选项即清空（→ 无父标签）
  selected.value = isSelected(id) ? [] : [id];
}

// 单选模式下，已选父标签的 path（从全量标签映射查找）
const selectedPath = computed<string | null>(() => {
  const id = selected.value[0];
  if (props.multiple || id === undefined) return null;
  return tagsStore.byId.get(id)?.path ?? null;
});

function clearSelection(): void {
  selected.value = [];
}

// 展开节点：从全量标签内存派生，无网络请求
function drill(colIndex: number, id: number): void {
  if (drillPath.value[colIndex] === id) return;
  // 只有当子标签存在时才展开
  if (tagsStore.childrenOf(id).length > 0) {
    drillPath.value = [...drillPath.value.slice(0, colIndex), id];
  }
}

function isActive(colIndex: number, id: number): boolean {
  return drillPath.value[colIndex] === id;
}

function expandable(id: number): boolean {
  return tagsStore.childrenOf(id).length > 0;
}

// 获取子标签数量（用于显示）
function getChildrenCount(id: number): number | undefined {
  const count = tagsStore.childrenOf(id).length;
  return count > 0 ? count : undefined;
}

// 搜索：使用全量标签（已在 onMounted 加载）
async function onSearch(): Promise<void> {
  const q = search.value.trim().toLowerCase();
  if (!props.searchable || !q) {
    searchResults.value = [];
    return;
  }

  searchResults.value = filterExcluded(
    tagsStore.tags.filter((t) => t.path.toLowerCase().includes(q)),
  )
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 50);
}

onMounted(async () => {
  // 一次性加载全量标签（级联/搜索/展开均从内存派生）
  await tagsStore.loadAll();
});
</script>

<template>
  <div>
    <!-- 单选模式：无父标签 / 已选摘要 -->
    <div v-if="!props.multiple" class="mb-2 flex items-center justify-between gap-2">
      <button
        type="button"
        class="flex items-center gap-2 rounded px-2 py-1 text-left text-sm ui-row-hover"
        :class="{ 'ui-active font-medium': selected.length === 0 }"
        @click="clearSelection"
      >
        <span
          class="grid h-4 w-4 place-items-center rounded border text-[10px]"
          :class="selected.length === 0 ? 'ui-check-active' : 'ui-check'"
          >{{ selected.length === 0 ? '✓' : '' }}</span
        >
        <span>{{ t('admin.noParent') }}</span>
      </button>
      <span v-if="selectedPath" class="flex items-center gap-2 text-xs ui-text-subtle">
        <span class="truncate">{{ selectedPath }}</span>
        <button type="button" class="ui-link" @click="clearSelection">
          {{ t('common.clear') }}
        </button>
      </span>
    </div>

    <input
      v-if="props.searchable"
      v-model="search"
      type="text"
      :placeholder="t('common.search')"
      class="mb-2 w-full ui-field-sm"
      @input="onSearch"
    />

    <!-- 搜索结果（扁平） -->
    <ul v-if="props.searchable && search.trim()" class="max-h-64 space-y-0.5 overflow-y-auto">
      <li v-for="tg in searchResults" :key="tg.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ui-row-hover"
          @click="toggle(tg.id)"
        >
          <span
            class="grid h-4 w-4 place-items-center rounded border text-[10px]"
            :class="isSelected(tg.id) ? 'ui-check-active' : 'ui-check'"
            >{{ isSelected(tg.id) ? '✓' : '' }}</span
          >
          <span class="truncate">{{ tg.path }}</span>
        </button>
      </li>
      <li v-if="!searchResults.length" class="px-2 py-1 text-xs ui-text-faint">
        {{ t('common.empty') }}
      </li>
    </ul>

    <!-- Miller 级联列 -->
    <div v-else class="flex gap-2 overflow-x-auto">
      <ul
        v-for="(col, ci) in columns"
        :key="ci"
        class="max-h-64 min-w-40 shrink-0 space-y-0.5 overflow-y-auto ui-divider"
        :class="{ 'border-l pl-2': ci > 0 }"
      >
        <li v-for="tg in col" :key="tg.id" class="flex items-center gap-1">
          <button
            type="button"
            class="grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px]"
            :class="isSelected(tg.id) ? 'ui-check-active' : 'ui-check'"
            @click="toggle(tg.id)"
          >
            {{ isSelected(tg.id) ? '✓' : '' }}
          </button>
          <button
            type="button"
            class="flex flex-1 items-center justify-between gap-1 rounded px-2 py-1 text-left text-sm ui-row-hover"
            :class="{ 'ui-active font-medium': isActive(ci, tg.id) }"
            @click="drill(ci, tg.id)"
          >
            <span class="truncate">{{ tg.name }}</span>
            <span v-if="expandable(tg.id)" class="shrink-0 text-xs opacity-50">
              <template v-if="getChildrenCount(tg.id)">{{ getChildrenCount(tg.id) }}</template>
              ›
            </span>
          </button>
        </li>
        <li v-if="!col.length" class="px-2 py-1 text-xs ui-text-faint">{{ t('common.empty') }}</li>
      </ul>
    </div>
  </div>
</template>
