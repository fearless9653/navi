<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ListToolbar, Pagination, SortSelector } from '@/components/molecules';
import BookmarkEditModal from '@/components/manage/BookmarkEditModal.vue';
import TagCascadePopover from '@/components/tags/TagCascadePopover.vue';
import { Favicon } from '@/components/atoms';
import { BaseButton, BaseBadge, BaseCheckbox, BaseSelect } from '@/components/atoms';
import { formatDate } from '@/lib/datetime';
import { useBookmarksStore } from '@/stores/bookmarks';
import { useConfirm } from '@/composables/useConfirm';
import { useResponsiveTablePageSize } from '@/composables/useResponsiveTablePageSize';
import type { Bookmark, BookmarkStatus, SortDir, SortKey } from '@/api/types';

const { t } = useI18n();
const bm = useBookmarksStore();
const { confirm } = useConfirm();
const { pageSize: responsivePageSize } = useResponsiveTablePageSize();

const modalOpen = ref(false);
const editing = ref<Bookmark | null>(null);
const sel = ref<number[]>([]);
const bulkTagIds = ref<number[]>([]);
const q = ref('');
const sortField = ref<SortKey>('created');
const sortDir = ref<SortDir>('desc'); // 默认降序
const statusFilter = ref<BookmarkStatus>('all');
// 搜索防抖计时器（下方 watch(q) 用）。
let qTimer: ReturnType<typeof setTimeout> | undefined;

const sortOptions = computed(() => [
  { key: 'created', label: t('common.createdAt') },
  { key: 'updated', label: t('common.updatedAt') },
  { key: 'weight', label: t('common.weight') },
]);

const statusOptions = computed<{ value: BookmarkStatus; label: string }[]>(() => [
  { value: 'all', label: t('manage.statusAll') },
  { value: 'active', label: t('manage.statusActive') },
  { value: 'inactive', label: t('manage.statusInactive') },
]);

const totalPages = computed(() => Math.max(1, Math.ceil(bm.total / bm.pageSize)));

const allSelected = computed(
  () => bm.items.length > 0 && bm.items.every((b) => sel.value.includes(b.id)),
);

async function reload(): Promise<void> {
  await bm.load({ status: statusFilter.value });
  sel.value = sel.value.filter((id) => bm.items.some((b) => b.id === id));
}

function changePage(p: number): void {
  bm.setPage(p);
  void reload();
}

function openNew(): void {
  editing.value = null;
  modalOpen.value = true;
}
function openEdit(b: Bookmark): void {
  editing.value = b;
  modalOpen.value = true;
}
async function onSaved(): Promise<void> {
  modalOpen.value = false;
  await reload();
}
async function remove(b: Bookmark): Promise<void> {
  if (!(await confirm({ message: t('manage.confirmDelete') }))) return;
  await bm.remove(b.id);
  await reload();
}

function toggleSel(id: number): void {
  sel.value = sel.value.includes(id) ? sel.value.filter((x) => x !== id) : [...sel.value, id];
}
function toggleAll(): void {
  const ids = bm.items.map((b) => b.id);
  sel.value = allSelected.value
    ? sel.value.filter((id) => !ids.includes(id))
    : [...new Set([...sel.value, ...ids])];
}
async function bulkDelete(): Promise<void> {
  if (!sel.value.length || !(await confirm({ message: t('manage.confirmDelete') }))) return;
  await bm.bulkDelete(sel.value);
  sel.value = [];
  await reload();
}
async function applyBulkTags(): Promise<void> {
  if (sel.value.length && bulkTagIds.value.length) {
    await bm.bulkTags(sel.value, bulkTagIds.value, 'assign');
    await reload();
  }
  bulkTagIds.value = [];
}

watch(sortField, (value) => {
  bm.setSort(value);
  void reload();
});

watch(sortDir, (value) => {
  bm.setDir(value);
  void reload();
});

watch(q, (value) => {
  bm.setQuery(value);
  // 防抖：管理页搜索每键一次网络请求（store 的 1s 缓存对不同关键字无效），照 HomeView 的 250ms。
  clearTimeout(qTimer);
  qTimer = setTimeout(() => void reload(), 250);
});

watch(statusFilter, () => {
  bm.setPage(1);
  void reload();
});

watch(responsivePageSize, (newSize, oldSize) => {
  if (oldSize !== undefined && newSize !== oldSize) {
    bm.pageSize = newSize;
    bm.setPage(1);
    void reload();
  }
});

onMounted(async () => {
  bm.setTagIds([]);
  bm.setQuery('');
  bm.setPage(1);
  bm.pageSize = responsivePageSize.value;
  bm.setSort(sortField.value);
  bm.setDir(sortDir.value);
  await bm.load({ status: statusFilter.value });
});

onUnmounted(() => {
  clearTimeout(qTimer); // 清掉在途搜索防抖
});
</script>

<template>
  <div class="flex flex-1 flex-col gap-3">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <ListToolbar search v-model:query="q" class="min-w-0 sm:flex-1" @new="openNew" />
      <div class="flex flex-wrap items-center gap-2">
        <BaseSelect v-model="statusFilter" size="sm" :options="statusOptions" />
        <SortSelector v-model:field="sortField" v-model:dir="sortDir" :options="sortOptions" />
      </div>
    </div>

    <div class="overflow-x-auto rounded-lg ui-surface-translucent modern-table">
      <!-- min-width = 各列最小可读宽之和：勾选32 + 名称180 + 标签120 + 状态90 + 创建110 + 更新110 + 操作120 = 762 -->
      <table class="w-full min-w-[762px] table-fixed text-left text-sm">
        <colgroup>
          <col class="w-8" />
          <col class="w-[32%]" />
          <col class="w-[20%]" />
          <col class="w-[90px]" />
          <col class="w-[110px]" />
          <col class="w-[110px]" />
          <col class="w-[120px]" />
        </colgroup>
        <thead class="table-header">
          <tr v-if="!sel.length">
            <th class="px-3">
              <BaseCheckbox :model-value="allSelected" @update:model-value="toggleAll" />
            </th>
            <th class="px-3">{{ t('manage.name') }}</th>
            <th class="px-3">{{ t('manage.tags') }}</th>
            <th class="px-3">{{ t('manage.status') }}</th>
            <th class="px-3">{{ t('common.createdAt') }}</th>
            <th class="px-3">{{ t('common.updatedAt') }}</th>
            <th class="px-3 text-right">{{ t('common.actions') }}</th>
          </tr>
          <tr v-else class="bulk-actions-row">
            <th colspan="7" class="px-3">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <BaseCheckbox :model-value="true" @update:model-value="sel = []" />
                  <span class="font-medium">{{ t('common.selected', { n: sel.length }) }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <TagCascadePopover
                    v-model="bulkTagIds"
                    :label="t('manage.bulkTag')"
                    :searchable="false"
                  />
                  <BaseButton
                    variant="ghost"
                    size="sm"
                    :disabled="!bulkTagIds.length"
                    @click="applyBulkTags"
                  >
                    {{ t('common.confirm') }}
                  </BaseButton>
                  <BaseButton variant="danger" size="sm" @click="bulkDelete">
                    {{ t('manage.bulkDelete') }}
                  </BaseButton>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bm.items" :key="b.id" class="table-row">
            <td class="px-3 py-2">
              <BaseCheckbox
                :model-value="sel.includes(b.id)"
                @update:model-value="toggleSel(b.id)"
              />
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <Favicon :src="b.faviconUrl" class="shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="truncate font-medium" :title="b.name">{{ b.name }}</div>
                  <div class="truncate text-xs ui-text-faint" :title="b.url">{{ b.url }}</div>
                </div>
              </div>
            </td>
            <td class="px-3 py-2">
              <div
                v-if="b.tags.length"
                class="flex gap-0.5 overflow-hidden"
                :title="b.tags.map((t) => t.path).join('\n')"
              >
                <BaseBadge
                  v-for="tg in b.tags.slice(0, 3)"
                  :key="tg.id"
                  size="xs"
                  class="max-w-full truncate"
                >
                  {{ tg.path }}
                </BaseBadge>
                <BaseBadge v-if="b.tags.length > 3" size="xs" class="shrink-0">
                  +{{ b.tags.length - 3 }}
                </BaseBadge>
              </div>
            </td>
            <td class="px-3 py-2">
              <BaseBadge size="xs" :class="{ 'opacity-60': !b.isActive }">
                {{ b.isActive ? t('manage.statusActive') : t('manage.statusInactive') }}
              </BaseBadge>
            </td>
            <td class="px-3 py-2 text-xs ui-text-subtle">
              {{ formatDate(b.createdDate) }}
            </td>
            <td class="px-3 py-2 text-xs ui-text-subtle">
              {{ formatDate(b.lastModifiedDate) }}
            </td>
            <td class="px-3 py-2 text-right">
              <button class="ui-link" @click="openEdit(b)">
                {{ t('common.edit') }}
              </button>
              <button class="ml-3 ui-link-danger" @click="remove(b)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="!bm.items.length">
            <td colspan="7" class="px-3 py-8 text-center ui-text-faint">{{ t('common.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination :current="bm.page" :total="totalPages" @change="changePage" />
  </div>

  <BookmarkEditModal
    v-if="modalOpen"
    :bookmark="editing"
    @saved="onSaved"
    @close="modalOpen = false"
  />
</template>
