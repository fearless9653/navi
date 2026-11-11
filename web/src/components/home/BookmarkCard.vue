<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import type { Bookmark } from '@/api/types';
import { useBookmarksStore } from '@/stores/bookmarks';
import { BaseCard } from '@/components/molecules';
import { BaseBadge, Favicon } from '@/components/atoms';

const props = defineProps<{ bookmark: Bookmark }>();
const emit = defineEmits<{ edit: [bookmark: Bookmark] }>();
const bm = useBookmarksStore();

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10; // px：超过则判定为滚动/拖动，取消长按

let pressTimer: ReturnType<typeof setTimeout> | undefined;
let startX = 0;
let startY = 0;
// 长按触发编辑后，抑制随后冒泡的 click，避免又打开网址。
const suppressClick = ref(false);
// 按压反馈：指针按下即置真，卡片轻微内缩；抬起/取消/移出/判定滚动后复位。
const pressed = ref(false);

function clearTimer(): void {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = undefined;
  }
}

function onPointerDown(e: PointerEvent): void {
  // 仅响应主键 / 触摸 / 触控笔
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  startX = e.clientX;
  startY = e.clientY;
  pressed.value = true;
  clearTimer();
  pressTimer = setTimeout(() => {
    pressTimer = undefined;
    suppressClick.value = true;
    emit('edit', props.bookmark);
  }, LONG_PRESS_MS);
}

function onPointerMove(e: PointerEvent): void {
  if (!pressTimer) return;
  if (
    Math.abs(e.clientX - startX) > MOVE_THRESHOLD ||
    Math.abs(e.clientY - startY) > MOVE_THRESHOLD
  ) {
    clearTimer();
    pressed.value = false; // 判定为滚动/拖动，撤销按压反馈
  }
}

function onPointerUp(): void {
  clearTimer();
  pressed.value = false;
}

function onContextMenu(e: Event): void {
  // 触摸长按会触发原生上下文菜单/呼出，屏蔽以保证长按编辑手感
  e.preventDefault();
}

function open(): void {
  if (suppressClick.value) {
    suppressClick.value = false;
    return;
  }
  void bm.visit(props.bookmark.id);
  window.open(props.bookmark.url, '_blank', 'noopener');
}

onBeforeUnmount(clearTimer);
</script>

<template>
  <div
    class="group relative"
    :class="{ 'is-pressed': pressed }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerUp"
    @contextmenu="onContextMenu"
  >
    <BaseCard
      interactive
      hoverable
      flush
      translucent
      class="flex h-28 flex-col text-left"
      data-bm-card
      :aria-label="bookmark.name"
      @click="open"
    >
      <!-- 顶部：图标 + 名称 (固定高度) -->
      <div class="flex h-8 shrink-0 items-center gap-2 px-3" :title="bookmark.name">
        <Favicon :src="bookmark.faviconUrl" class="shrink-0" />
        <span
          class="truncate text-sm font-medium transition-colors duration-300 group-hover:[color:var(--color-accent)]"
          >{{ bookmark.name }}</span
        >
      </div>

      <!-- 中间：描述 (固定高度) -->
      <div
        class="flex h-12 shrink-0 items-start px-3 py-2"
        :title="bookmark.description ?? undefined"
      >
        <p v-if="bookmark.description" class="line-clamp-2 text-xs leading-tight ui-text-subtle">
          {{ bookmark.description }}
        </p>
      </div>

      <!-- 底部：标签 (固定高度) -->
      <div
        class="flex h-8 shrink-0 items-center gap-1 overflow-hidden px-3"
        :title="bookmark.tags.map((x) => x.path).join('\n')"
      >
        <BaseBadge
          v-for="tg in bookmark.tags.slice(0, 3)"
          :key="tg.id"
          size="xs"
          class="max-w-full truncate"
        >
          {{ tg.path }}
        </BaseBadge>
        <BaseBadge v-if="bookmark.tags.length > 3" size="xs" class="shrink-0">
          +{{ bookmark.tags.length - 3 }}
        </BaseBadge>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
/* 首页网址卡片的 hover 语言：几何静止（不上浮/不缩放），改用「描边点亮 + 表面提亮」回应指针。
   位移/缩放会连带放大文字并触发 reflow 抖动；静止方案更克制、更现代（Linear/Vercel 风）。 */

/* 复用 BaseCard 「玻璃面之上、内容之下」的伪元素层（z-index:-1 + isolation）：
   把默认的斜向掠光带换成一层均匀的 accent 提亮，随 .card-hoverable:hover::before 淡入。 */
:deep([data-bm-card].card)::before {
  background-image: none;
  background-color: color-mix(in srgb, var(--color-accent) 8%, transparent);
}

/* 覆盖 BaseCard 的整卡 translateY + scale：仅首页网址卡片改为静止。
   描边染 accent 与阴影抬升仍由 BaseCard 提供，作为无位移的层级提示。 */
:deep([data-bm-card].card:hover) {
  transform: none;
}

/* 按压反馈：指针按下时卡片轻微内缩，给长按/点击一个即时的触感回应。
   放在 :hover 覆盖之后 → 同特异性下靠源码顺序取胜，按压态压过静止态。
   收回走 BaseCard .card 的 ease-out，回弹自然。 */
.is-pressed :deep([data-bm-card].card) {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .is-pressed :deep([data-bm-card].card) {
    transform: none;
  }
}
</style>
