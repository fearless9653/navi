<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ListToolbar } from '@/components/molecules';
import { BaseChevron } from '@/components/atoms';
import TagEditModal from '@/components/manage/TagEditModal.vue';
import { formatDate } from '@/lib/datetime';
import { useTagsStore } from '@/stores/tags';
import { useConfirm } from '@/composables/useConfirm';
import type { Tag } from '@/api/types';

const { t } = useI18n();
const store = useTagsStore();
const { confirm } = useConfirm();
const q = ref('');
const modalOpen = ref(false);
const editing = ref<Tag | null>(null);

// 懒加载状态
const expandedIds = ref(new Set<number>()); // 已展开的标签 ID
const childrenMap = ref(new Map<number, Tag[]>()); // 父节点 → 子节点缓存
const rootTags = ref<Tag[]>([]); // 根标签
const searchMode = ref(false); // 搜索模式（使用全量数据）
const searchResults = ref<Tag[]>([]); // 搜索结果

// 树形展示的标签列表（懒加载模式）
const treeList = computed(() => {
  const result: Tag[] = [];

  function addChildren(parentTags: Tag[], depth: number): void {
    for (const tag of parentTags) {
      result.push(tag);
      if (expandedIds.value.has(tag.id)) {
        const children = childrenMap.value.get(tag.id);
        if (children && children.length > 0) {
          addChildren(children, depth + 1);
        }
      }
    }
  }

  addChildren(rootTags.value, 0);
  return result;
});

// 显示的标签列表（搜索模式或树形模式）
const displayList = computed(() => {
  if (searchMode.value) {
    return searchResults.value;
  }
  return treeList.value;
});

// 是否可展开
function isExpandable(tag: Tag): boolean {
  return (tag.childrenCount ?? 0) > 0;
}

// 是否已展开
function isExpanded(id: number): boolean {
  return expandedIds.value.has(id);
}

function tagIndent(tg: Tag): string {
  return `${(tg.path.match(/\//g) ?? []).length * 2}ch`;
}

// 切换展开/折叠
async function toggleExpand(tag: Tag): Promise<void> {
  if (!isExpandable(tag)) return;

  if (expandedIds.value.has(tag.id)) {
    // 折叠
    expandedIds.value.delete(tag.id);
    expandedIds.value = new Set(expandedIds.value); // 触发响应式更新
  } else {
    // 展开：懒加载子标签
    if (!childrenMap.value.has(tag.id)) {
      const children = await store.loadChildren(tag.id);
      childrenMap.value.set(tag.id, children);
    }
    expandedIds.value.add(tag.id);
    expandedIds.value = new Set(expandedIds.value);
  }
}

// 搜索处理
async function onSearch(): Promise<void> {
  const query = q.value.trim().toLowerCase();

  if (!query) {
    // 退出搜索模式
    searchMode.value = false;
    searchResults.value = [];
    return;
  }

  // 进入搜索模式：需要加载全量数据
  if (store.tags.length === 0) {
    await store.load();
  }

  searchMode.value = true;
  searchResults.value = store.tags
    .filter((tg) => tg.path.toLowerCase().includes(query))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function openNew(): Promise<void> {
  // 确保加载全量标签（用于选择父标签）
  if (store.tags.length === 0) {
    await store.load();
  }
  editing.value = null;
  modalOpen.value = true;
}

async function openEdit(tg: Tag): Promise<void> {
  // 确保加载全量标签（用于选择父标签）
  if (store.tags.length === 0) {
    await store.load();
  }
  editing.value = tg;
  modalOpen.value = true;
}

async function remove(tg: Tag): Promise<void> {
  if (!(await confirm({ message: t('manage.confirmDelete') }))) return;
  await store.remove(tg.id);
  await reload();
}

async function reload(): Promise<void> {
  // 重新加载根标签和已展开的子标签
  await store.loadRoot();
  rootTags.value = store.rootTags;

  // 刷新已展开节点的子标签
  const expandedArray = Array.from(expandedIds.value);
  childrenMap.value.clear();
  for (const parentId of expandedArray) {
    const children = await store.loadChildren(parentId);
    childrenMap.value.set(parentId, children);
  }

  // 如果在搜索模式，刷新搜索结果
  if (searchMode.value) {
    await store.load();
    await onSearch();
  }
}

async function onSaved(): Promise<void> {
  modalOpen.value = false;
  await reload();
}

onMounted(async () => {
  await store.loadRoot();
  rootTags.value = store.rootTags;
});
</script>

<template>
  <div class="space-y-4">
    <ListToolbar search v-model:query="q" @new="openNew" @update:query="onSearch" />

    <div class="overflow-x-auto rounded-lg ui-surface-translucent">
      <!-- min-width = 各列最小可读宽之和：标签名220 + 路径160 + 创建110 + 更新110 + 操作120 = 720 -->
      <table class="w-full min-w-[720px] text-left text-sm">
        <thead class="border-b ui-divider ui-fill-muted-translucent ui-text-subtle">
          <tr>
            <th class="px-3 py-2">{{ t('admin.tags') }}</th>
            <th class="px-3 py-2">{{ t('manage.tagPath') }}</th>
            <th class="px-3 py-2">{{ t('common.createdAt') }}</th>
            <th class="px-3 py-2">{{ t('common.updatedAt') }}</th>
            <th class="px-3 py-2 text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tg in displayList" :key="tg.id" class="border-b ui-divider last:border-0">
            <td class="px-3 py-2">
              <div class="flex items-center gap-1" :style="{ paddingInlineStart: tagIndent(tg) }">
                <!-- 展开/折叠按钮 -->
                <button
                  v-if="!searchMode && isExpandable(tg)"
                  type="button"
                  class="flex h-4 w-4 shrink-0 items-center justify-center ui-text-faint ui-expand-toggle"
                  @click="toggleExpand(tg)"
                >
                  <!-- 树展开指示：复用自绘 chevron；展开=指下(0°)、折叠=指右(-90°) -->
                  <BaseChevron
                    size="0.625rem"
                    class="tag-expand-chevron"
                    :class="{ 'tag-expand-chevron--collapsed': !isExpanded(tg.id) }"
                  />
                </button>
                <span v-else-if="!searchMode" class="w-4 shrink-0"></span>

                <!-- 标签名称 -->
                <span class="truncate">{{ tg.name }}</span>

                <!-- 子标签数量提示 -->
                <span v-if="!searchMode && isExpandable(tg)" class="ml-1 text-[10px] ui-text-faint">
                  ({{ tg.childrenCount }})
                </span>
              </div>
            </td>
            <td class="px-3 py-2">
              <!-- 标签路径：参照 BookmarksSection 样式 -->
              <span class="px-1.5 py-0.5 text-[10px] ui-chip">
                {{ tg.path }}
              </span>
            </td>
            <td class="px-3 py-2 text-xs ui-text-subtle">
              {{ formatDate(tg.createdDate) }}
            </td>
            <td class="px-3 py-2 text-xs ui-text-subtle">
              {{ formatDate(tg.lastModifiedDate) }}
            </td>
            <td class="px-3 py-2 text-right">
              <button class="ui-link" @click="openEdit(tg)">
                {{ t('common.edit') }}
              </button>
              <button class="ml-3 ui-link-danger" @click="remove(tg)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="!displayList.length">
            <td colspan="5" class="px-3 py-8 text-center ui-text-faint">
              {{ t('common.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <TagEditModal v-if="modalOpen" :tag="editing" @saved="onSaved" @close="modalOpen = false" />
</template>

<style scoped>
/* 树展开指示：复用自绘 chevron。展开=指下（BaseChevron 默认 0°），
   折叠=指右（-90°）。旋转过渡由 BaseChevron 自带，切换时平滑转动。 */
.tag-expand-chevron--collapsed {
  transform: rotate(-90deg);
}
</style>
