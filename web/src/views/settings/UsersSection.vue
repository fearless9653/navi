<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ListToolbar, Pagination, SortSelector } from '@/components/molecules';
import UserEditModal from '@/components/manage/UserEditModal.vue';
import { ApiException } from '@/api/client';
import { useConfirm } from '@/composables/useConfirm';
import { formatDate } from '@/lib/datetime';
import { useAdminUsersStore } from '@/stores/adminUsers';
import type { PublicUser } from '@/api/types';

const { t } = useI18n();
const store = useAdminUsersStore();
const { confirm } = useConfirm();
const q = ref('');
const page = ref(1);
const pageSize = 10;
const modalOpen = ref(false);
const editing = ref<PublicUser | null>(null);
const error = ref('');
const sortField = ref<'created' | 'updated'>('created'); // 默认按创建时间
const sortDir = ref<'asc' | 'desc'>('desc'); // 默认降序

const sortOptions = computed(() => [
  { key: 'created', label: t('common.createdAt') },
  { key: 'updated', label: t('common.updatedAt') },
]);

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  const list = s
    ? store.users.filter(
        (u) => u.email.toLowerCase().includes(s) || u.displayName.toLowerCase().includes(s),
      )
    : store.users;

  // 排序（时间为 ISO 8601 字符串，字典序等价于时间序）；方向由 sortDir 决定
  const mul = sortDir.value === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sortField.value === 'created') return mul * a.createdDate.localeCompare(b.createdDate);
    if (sortField.value === 'updated')
      return mul * a.lastModifiedDate.localeCompare(b.lastModifiedDate);
    return 0;
  });
});

const paged = computed(() => {
  const start = (page.value - 1) * pageSize;
  return filtered.value.slice(start, start + pageSize);
});

const totalPages = computed(() => Math.ceil(filtered.value.length / pageSize));

// 搜索变化时回到第 1 页：本地分页不像书签那样由 store 重置 page，否则会停留在过滤后不存在的页
// （表格空白，且 totalPages 变 1 使分页控件隐藏，无从翻回）。
watch(q, () => {
  page.value = 1;
});
// 过滤/删末条导致总页数变小时，把越界的 page 钳回范围内。
watch(totalPages, (tp) => {
  if (page.value > tp) page.value = Math.max(1, tp);
});

function changePage(p: number): void {
  page.value = p;
}

function openNew(): void {
  editing.value = null;
  modalOpen.value = true;
}
function openEdit(u: PublicUser): void {
  editing.value = u;
  modalOpen.value = true;
}
async function remove(u: PublicUser): Promise<void> {
  if (!(await confirm({ message: t('manage.confirmDelete') }))) return;
  error.value = '';
  try {
    await store.remove(u.id);
  } catch (e) {
    const body = e instanceof ApiException ? (e.body as { error?: string } | null) : null;
    error.value = body?.error === 'last_admin' ? t('admin.lastAdmin') : (body?.error ?? 'error');
  }
}

onMounted(() => void store.load());
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <ListToolbar search v-model:query="q" @new="openNew" />
      <SortSelector v-model:field="sortField" v-model:dir="sortDir" :options="sortOptions" />
    </div>
    <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>

    <div class="overflow-x-auto rounded-lg ui-surface-translucent modern-table">
      <!-- min-width = 各列最小可读宽之和：邮箱180 + 管理员70 + 启用70 + 创建110 + 更新110 + 操作120 = 660 -->
      <table class="w-full min-w-[660px] text-left text-sm">
        <thead class="table-header">
          <tr>
            <th class="px-3 py-3">{{ t('auth.email') }}</th>
            <th class="px-3 py-3">{{ t('admin.isAdmin') }}</th>
            <th class="px-3 py-3">{{ t('admin.active') }}</th>
            <th class="px-3 py-3">{{ t('common.createdAt') }}</th>
            <th class="px-3 py-3">{{ t('common.updatedAt') }}</th>
            <th class="px-3 py-3 text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in paged" :key="u.id" class="table-row">
            <td class="px-3 py-3">
              <div class="font-medium">{{ u.displayName }}</div>
              <div class="text-xs ui-text-faint">{{ u.email }}</div>
            </td>
            <td class="px-3 py-3">{{ u.isAdmin ? '✓' : '—' }}</td>
            <td class="px-3 py-3">{{ u.isActive ? '✓' : '—' }}</td>
            <td class="px-3 py-3 text-xs ui-text-subtle">
              {{ formatDate(u.createdDate) }}
            </td>
            <td class="px-3 py-3 text-xs ui-text-subtle">
              {{ formatDate(u.lastModifiedDate) }}
            </td>
            <td class="px-3 py-3 text-right">
              <button class="ui-link" @click="openEdit(u)">
                {{ t('common.edit') }}
              </button>
              <button class="ml-3 ui-link-danger" @click="remove(u)">
                {{ t('common.delete') }}
              </button>
            </td>
          </tr>
          <tr v-if="!paged.length">
            <td colspan="6" class="px-3 py-8 text-center ui-text-faint">{{ t('common.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination :current="page" :total="totalPages" @change="changePage" />
  </div>

  <UserEditModal
    v-if="modalOpen"
    :user="editing"
    @saved="modalOpen = false"
    @close="modalOpen = false"
  />
</template>
