<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Bookmark } from '@/api/types';
import { useBookmarksStore } from '@/stores/bookmarks';
import { MAX_PAGE_SIZE } from '@/composables/useResponsivePageSize';
import { BaseButton } from '@/components/atoms';
import BookmarkCard from './BookmarkCard.vue';

defineEmits<{ edit: [bookmark: Bookmark] }>();

const { t } = useI18n();
const bm = useBookmarksStore();

// 四态互斥键：驱动外层 <Transition mode="out-in"> 的交叉淡入。
// error 优先于 empty——失败时 items 为空，但要显示「加载失败 + 重试」而非「暂无」。
const state = computed<'loading' | 'error' | 'empty' | 'list'>(() =>
  bm.loading ? 'loading' : bm.error ? 'error' : bm.items.length ? 'list' : 'empty',
);

// 重试：强制重拉当前查询（失败响应未入缓存，force 亦确保绕过任何残留短缓存）。
function retry(): void {
  void bm.load({ force: true, detail: false });
}

// 骨架格数量：贴合当前页容量，避免加载态与内容态的网格尺寸跳动。
// 上限兜底防异常大页，与桌面页容量上限同源（MAX_PAGE_SIZE），避免大屏下骨架少于内容导致网格跳高。
const skeletonCount = computed(() => Math.min(Math.max(bm.pageSize, 1), MAX_PAGE_SIZE));
</script>

<template>
  <!-- 三态交叉淡入：out-in 先淡出旧态再淡入新态，消除「内容→加载文字→内容」的硬闪。
       list 内部仍保留 BookmarkCard 的 stagger 渐入（TransitionGroup），两层动效不冲突。 -->
  <Transition name="grid-state" mode="out-in">
    <!-- 加载态：骨架屏。复用真实网格的 grid 类 + data-bm-grid，桌面动态列数/行距一致。 -->
    <div
      v-if="state === 'loading'"
      key="loading"
      data-bm-grid
      data-test="bm-grid-skeleton"
      class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3"
    >
      <div
        v-for="i in skeletonCount"
        :key="i"
        class="bm-skeleton ui-surface-translucent flex h-28 flex-col overflow-hidden rounded-[var(--radius-md)]"
      >
        <!-- 顶部：图标 + 名称 -->
        <div class="flex h-8 shrink-0 items-center gap-2 px-3">
          <span class="sk-bar h-4 w-4 shrink-0 rounded" />
          <span class="sk-bar h-3 w-2/3 rounded" />
        </div>
        <!-- 中间：描述两行 -->
        <div class="flex h-12 shrink-0 flex-col justify-center gap-1.5 px-3">
          <span class="sk-bar h-2.5 w-full rounded" />
          <span class="sk-bar h-2.5 w-4/5 rounded" />
        </div>
        <!-- 底部：标签 -->
        <div class="flex h-8 shrink-0 items-center gap-1 px-3">
          <span class="sk-bar h-3.5 w-10 rounded-full" />
          <span class="sk-bar h-3.5 w-12 rounded-full" />
        </div>
      </div>
    </div>

    <!-- 加载失败：提示 + 重试按钮。取代静默掉到「暂无」，让偶发失败可自恢复。 -->
    <div
      v-else-if="state === 'error'"
      key="error"
      data-test="bm-grid-error"
      class="flex flex-col items-center gap-3 py-10 text-center"
    >
      <p class="text-sm ui-text-faint">{{ t('common.loadFailed') }}</p>
      <BaseButton variant="secondary" size="sm" @click="retry">
        {{ t('common.retry') }}
      </BaseButton>
    </div>

    <div v-else-if="state === 'empty'" key="empty" class="py-10 text-center text-sm ui-text-faint">
      {{ t('common.empty') }}
    </div>

    <!-- 手机静态列（2 → md:3）；桌面（≥1024）列数由 --bm-cols 动态反解（见下方媒体查询）。 -->
    <!-- 列表渐入 stagger（docs 03），尊重 prefers-reduced-motion -->
    <TransitionGroup
      v-else
      key="list"
      tag="div"
      name="bm"
      data-bm-grid
      class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3"
    >
      <BookmarkCard
        v-for="(b, i) in bm.items"
        :key="b.id"
        :bookmark="b"
        class="bm-item"
        :style="{ '--i': Math.min(i, 12) }"
        @edit="$emit('edit', $event)"
      />
    </TransitionGroup>
  </Transition>
</template>

<style scoped>
/* 桌面动态列数与行距：消费 HomeView 下发的 --bm-cols / --bm-row-gap
   （由 useResponsivePageSize 按网格实测宽/高反解）。
   列数覆盖静态 grid-cols-2/md:grid-cols-3（仅手机档生效）；行距仅覆盖 row-gap，
   列距照旧走 gap-3/sm:gap-4。padding-block 为上下边缘补上均摊量
   （行距 − 基础 GAP，此处 1rem 必须等于 sm:gap-4）：叠加 section gap-4 后，
   「分隔线 ↔ 首行」「末行 ↔ 分页器」= 16 + 均摊量 = 行距，三种间距同节奏。
   1024px 与「视口 < 1024 即手机」判据锚定同一断点，改动需与 useResponsivePageSize.ts
   的护栏注释四处同步。骨架屏共用同一 [data-bm-grid]，故加载态与内容态网格尺寸一致。 */
@media (min-width: 1024px) {
  [data-bm-grid] {
    grid-template-columns: repeat(var(--bm-cols, 4), minmax(0, 1fr));
    row-gap: var(--bm-row-gap, 1rem);
    padding-block: calc(var(--bm-row-gap, 1rem) - 1rem);
  }
}

/* 三态交叉淡入：纯 opacity（out-in 下位移会读成跳动），进出对称。
   用 transition 故自动受全局 reduced-motion 压制，无需逐类兜底。 */
.grid-state-enter-active,
.grid-state-leave-active {
  transition: opacity var(--duration-fast) var(--ease-out);
}
.grid-state-enter-from,
.grid-state-leave-to {
  opacity: 0;
}

.bm-enter-active {
  transition:
    opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
  transition-delay: calc(var(--i, 0) * 25ms);
}
.bm-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

/* 骨架条：surface-muted 底 + 掠光 shimmer，暗示「内容加载中」。 */
.sk-bar {
  display: block;
  background-color: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--color-text-primary) 6%, transparent) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  animation: sk-shimmer 1.4s ease-in-out infinite;
}
@keyframes sk-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bm-enter-active {
    transition: none;
  }
  .bm-enter-from {
    opacity: 1;
    transform: none;
  }
  /* shimmer 关掉，保留静态底色即可 */
  .sk-bar {
    animation: none;
    background-image: none;
  }
}
</style>
