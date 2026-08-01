<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseButton } from '@/components/atoms';

const props = defineProps<{
  current: number;
  total: number;
}>();

const emit = defineEmits<{ change: [page: number] }>();

const { t } = useI18n();

const totalPages = computed(() => Math.max(1, props.total));
const showJump = computed(() => totalPages.value > 5);
const jumpValue = ref('');

function prev(): void {
  if (props.current > 1) emit('change', props.current - 1);
}

function next(): void {
  if (props.current < totalPages.value) emit('change', props.current + 1);
}

function goToPage(page: number): void {
  if (page >= 1 && page <= totalPages.value && page !== props.current) {
    emit('change', page);
  }
}

function handleJump(): void {
  const page = parseInt(jumpValue.value, 10);
  if (!isNaN(page)) {
    goToPage(page);
    jumpValue.value = '';
  }
}

const pageNumbers = computed(() => {
  const { current } = props;
  const total = totalPages.value;
  const pages: (number | 'ellipsis')[] = [];

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }

  pages.push(1);

  if (current <= 3) {
    for (let i = 2; i <= 4; i++) pages.push(i);
    pages.push('ellipsis');
    pages.push(total);
  } else if (current >= total - 2) {
    pages.push('ellipsis');
    for (let i = total - 3; i <= total; i++) pages.push(i);
  } else {
    pages.push('ellipsis');
    for (let i = current - 1; i <= current + 1; i++) pages.push(i);
    pages.push('ellipsis');
    pages.push(total);
  }

  return pages;
});

watch(
  () => props.current,
  () => {
    jumpValue.value = '';
  },
);
</script>

<template>
  <div v-if="totalPages > 1" class="pagination">
    <BaseButton
      variant="ghost"
      size="sm"
      icon-only
      :disabled="current <= 1"
      @click="prev"
      class="pagination-btn"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10 12L6 8L10 4"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </BaseButton>

    <div class="pagination-pages">
      <button
        v-for="(page, idx) in pageNumbers"
        :key="`page-${idx}`"
        :class="[
          'pagination-page',
          {
            'pagination-page-active': page === current,
            'pagination-ellipsis': page === 'ellipsis',
          },
        ]"
        :disabled="page === 'ellipsis'"
        @click="page !== 'ellipsis' && goToPage(page)"
      >
        {{ page === 'ellipsis' ? '···' : page }}
      </button>
    </div>

    <BaseButton
      variant="ghost"
      size="sm"
      icon-only
      :disabled="current >= totalPages"
      @click="next"
      class="pagination-btn"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 4L10 8L6 12"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </BaseButton>

    <div v-if="showJump" class="pagination-jump">
      <input
        v-model="jumpValue"
        type="number"
        min="1"
        :max="totalPages"
        :placeholder="t('common.jumpTo')"
        class="pagination-jump-input"
        @keyup.enter="handleJump"
      />
      <BaseButton variant="ghost" size="sm" @click="handleJump"> {{ t('common.go') }} </BaseButton>
    </div>
  </div>
</template>

<style scoped>
/* 翻页条 = 默认 12px 弱玻璃档（与网址卡片同档：不覆盖 --glass-blur、不叠边缘折射）。
   但体积小、字也小、又贴在卡片网格下方的壁纸上，弱玻璃本身不足以保住可读性，
   故在「配方」层把 surface 提到 72% / border 提到 65%（比 ui-surface-translucent 的
   60% 更发实一点）作补偿——见 Pagination.test.ts 的 readable-over-wallpaper 断言。
   URL 卡片体积大、留白多、有 hover 抬升撑场，无需此补偿，仍用标准 60%：
   两套配方各为其文体服务，不需互相拉齐。离地阴影用 --shadow-sm 略抬起呈工具条感。 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  padding: var(--spacing-1-5) var(--spacing-2);
  border: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent);
  border-radius: var(--radius-full);
  background-color: color-mix(in srgb, var(--color-surface) 72%, transparent);
  -webkit-backdrop-filter: var(--glass-backdrop);
  backdrop-filter: var(--glass-backdrop);
  box-shadow: var(--shadow-sm);
}

.pagination-btn {
  color: var(--color-text-primary);
  transition: all var(--duration-fast) var(--ease-out);
}

.pagination-pages {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.pagination-page {
  min-width: 2rem;
  height: 2rem;
  padding: 0 var(--spacing-2);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-base);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  background-color: color-mix(in srgb, var(--color-surface-muted) 38%, transparent);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.pagination-page:hover:not(:disabled):not(.pagination-page-active) {
  background-color: color-mix(in srgb, var(--color-surface-muted) 82%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 28%, transparent);
  color: var(--color-text-primary);
}

.pagination-page-active {
  background-color: var(--color-accent);
  color: var(--color-on-accent);
  border-color: var(--color-accent);
  cursor: default;
}

.pagination-ellipsis {
  cursor: default;
  color: var(--color-text-secondary);
  background-color: transparent;
}

.pagination-ellipsis:hover {
  background-color: transparent;
}

.pagination-jump {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-left: var(--spacing-3);
  padding-left: var(--spacing-3);
  border-left: 1px solid color-mix(in srgb, var(--color-divider) 76%, transparent);
}

.pagination-jump-input {
  width: 4rem;
  height: 2rem;
  padding: 0 var(--spacing-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  text-align: center;
  outline: none;
  transition: all var(--duration-base) var(--ease-out);
}

.pagination-jump-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 var(--focus-ring-width) var(--color-focus-ring);
}

.pagination-jump-input::placeholder {
  color: var(--color-text-faint);
}

.pagination-jump-input::-webkit-inner-spin-button,
.pagination-jump-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.pagination-jump-input[type='number'] {
  -moz-appearance: textfield;
}

@media (max-width: 640px) {
  .pagination {
    border-radius: var(--radius-xl);
  }

  .pagination-jump {
    width: 100%;
    justify-content: center;
    margin-left: 0;
    padding-top: var(--spacing-1);
    padding-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--color-divider) 76%, transparent);
    border-left: 0;
  }
}
</style>
