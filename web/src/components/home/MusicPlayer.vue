<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMusicStore } from '@/stores/music';
import { usePrefsStore } from '@/stores/prefs';

const { t } = useI18n();
const music = useMusicStore();
const prefs = usePrefsStore();

const hovered = ref(false);
const volumeOpen = ref(false);
const nameEl = ref<HTMLElement | null>(null);
const nameOverflows = ref(false);

onMounted(async () => {
  if (!prefs.prefs) await prefs.load();
  music.loadPlaylist();
});

function checkNameOverflow(): void {
  const el = nameEl.value;
  if (el && el.clientWidth > 0) {
    nameOverflows.value = el.scrollWidth > el.clientWidth;
  }
}

let overflowTimer: ReturnType<typeof setTimeout> | undefined;
watch(hovered, (val) => {
  if (val) {
    clearTimeout(overflowTimer);
    overflowTimer = setTimeout(checkNameOverflow, 320);
  }
});

watch(
  () => music.currentTrack?.name,
  () => {
    nameOverflows.value = false;
    if (hovered.value) {
      nextTick(checkNameOverflow);
    }
  },
);

const progressPercent = computed(() => {
  if (!music.duration) return 0;
  return (music.currentTime / music.duration) * 100;
});

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 拖拽中途卸载（如键盘登出）时，兜底移除挂在 document 上的 mousemove/mouseup。
let dragCleanup: (() => void) | null = null;

function startDrag(e: MouseEvent): void {
  // 先取住进度条元素：事件派发结束后 e.currentTarget 变为 null，
  // 不能在 mousemove 回调里再读。
  const bar = e.currentTarget as HTMLElement;
  const seekTo = (ev: MouseEvent): void => {
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    music.seek(ratio * music.duration);
  };
  seekTo(e);
  const onUp = (): void => {
    document.removeEventListener('mousemove', seekTo);
    document.removeEventListener('mouseup', onUp);
    dragCleanup = null;
  };
  document.addEventListener('mousemove', seekTo);
  document.addEventListener('mouseup', onUp);
  dragCleanup = onUp; // 记录当前拖拽的清理，供组件在拖拽中途卸载时兜底移除监听
}

onUnmounted(() => {
  clearTimeout(overflowTimer);
  dragCleanup?.();
});

function onVolumeChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  music.setVolume(parseFloat(input.value));
}

const loopIcon = computed(() => {
  switch (music.loopMode) {
    case 'single':
      return 'single';
    case 'all':
      return 'all';
    default:
      return 'none';
  }
});

const loopTitle = computed(() => {
  switch (music.loopMode) {
    case 'single':
      return t('music.loopSingle');
    case 'all':
      return t('music.loopAll');
    default:
      return t('music.loopNone');
  }
});
</script>

<template>
  <div
    v-if="music.hasPlaylist"
    class="music-player ui-surface-translucent fixed flex items-center rounded-full shadow-lg"
    :class="[volumeOpen ? 'overflow-visible' : 'overflow-hidden']"
    @mouseenter="hovered = true"
    @mouseleave="
      hovered = false;
      volumeOpen = false;
    "
  >
    <!-- 唱片光盘 -->
    <div class="flex shrink-0 items-center justify-center p-[7px]">
      <button
        class="vinyl-disc relative h-14 w-14 shrink-0 rounded-full"
        :class="['vinyl-spinning', { 'vinyl-paused': !music.isPlaying }]"
        :aria-label="music.isPlaying ? 'Pause' : 'Play'"
        @click="music.toggle()"
      >
        <div
          class="absolute inset-0 rounded-full"
          style="
            background: radial-gradient(
              circle,
              var(--color-neutral-800) 18%,
              var(--color-neutral-900) 20%,
              var(--color-neutral-700) 22%,
              var(--color-neutral-900) 40%,
              var(--color-neutral-800) 42%,
              var(--color-neutral-900) 60%,
              var(--color-neutral-700) 62%,
              var(--color-neutral-800) 80%,
              var(--color-neutral-900) 100%
            );
          "
        >
          <div class="absolute inset-[6px] overflow-hidden rounded-full">
            <img
              v-if="music.coverUrl"
              :src="music.coverUrl"
              alt=""
              class="h-full w-full object-cover"
              style="opacity: 0.7"
            />
            <img
              v-else
              src="/trace.svg"
              alt=""
              class="h-full w-full object-cover"
              style="opacity: 0.7; transform: scaleX(-1)"
            />
          </div>
        </div>
      </button>
    </div>

    <!-- 展开面板 -->
    <div
      class="flex flex-col justify-center transition-all duration-300"
      :class="[
        hovered ? 'player-panel-open' : 'player-panel-closed',
        volumeOpen ? 'overflow-visible' : 'overflow-hidden',
      ]"
      style="height: 52px"
    >
      <!-- 第一行：歌曲名 + 控制按钮 -->
      <div class="flex items-center justify-between gap-2">
        <div
          ref="nameEl"
          class="min-w-0 flex-1 overflow-hidden text-xs font-medium"
          style="color: var(--color-text-primary)"
        >
          <div class="whitespace-nowrap" :class="{ 'marquee-scroll': nameOverflows }">
            <span :class="{ 'pr-8': nameOverflows }">{{ music.currentTrack?.name || '---' }}</span>
            <span v-if="nameOverflows" class="pr-8">{{ music.currentTrack?.name }}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <!-- 上一首 -->
          <button
            class="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            :aria-label="t('music.previous')"
            @click="music.prev()"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              style="color: var(--color-text-primary)"
            >
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          <!-- 播放/暂停 -->
          <button
            class="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            style="background: var(--color-accent); color: var(--color-on-accent)"
            :aria-label="music.isPlaying ? t('music.pause') : t('music.play')"
            :title="`${music.isPlaying ? t('music.pause') : t('music.play')} (P)`"
            aria-keyshortcuts="p"
            @click="music.toggle()"
          >
            <svg v-if="music.isPlaying" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            <svg v-else class="ml-0.5 h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <!-- 下一首 -->
          <button
            class="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            :aria-label="t('music.next')"
            @click="music.next()"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              style="color: var(--color-text-primary)"
            >
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
          <!-- 循环模式 -->
          <button
            class="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            :title="loopTitle"
            :aria-label="loopTitle"
            @click="music.cycleLoopMode()"
          >
            <svg
              v-if="loopIcon === 'all'"
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              style="color: var(--color-accent)"
            >
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
            </svg>
            <svg
              v-else-if="loopIcon === 'single'"
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              style="color: var(--color-accent)"
            >
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
              <text
                x="10.5"
                y="15"
                font-size="7"
                font-weight="bold"
                fill="currentColor"
                text-anchor="middle"
              >
                1
              </text>
            </svg>
            <svg
              v-else
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              style="color: var(--color-text-subtle)"
            >
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
            </svg>
          </button>
          <!-- 音量 -->
          <div class="relative">
            <button
              class="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              :aria-label="t('music.volume')"
              @click="volumeOpen = !volumeOpen"
            >
              <svg
                v-if="music.volume > 0.5"
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                style="color: var(--color-text-primary)"
              >
                <path
                  d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                />
              </svg>
              <svg
                v-else-if="music.volume > 0"
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                style="color: var(--color-text-primary)"
              >
                <path
                  d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"
                />
              </svg>
              <svg
                v-else
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                style="color: var(--color-text-subtle)"
              >
                <path
                  d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
                />
              </svg>
            </button>
            <!-- 音量滑块弹窗 -->
            <div
              v-show="volumeOpen"
              class="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-xl p-2 shadow-md"
              style="background: var(--color-surface); border: 1px solid var(--color-border)"
            >
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="music.volume"
                class="volume-slider"
                @input="onVolumeChange"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 第二行：进度条 -->
      <div class="mt-1 flex items-center gap-1.5">
        <span
          class="w-8 text-right text-[10px] tabular-nums"
          style="color: var(--color-text-subtle)"
        >
          {{ formatTime(music.currentTime) }}
        </span>
        <div
          class="relative h-1 flex-1 cursor-pointer rounded-full"
          style="background: var(--color-border)"
          @mousedown="startDrag"
        >
          <div
            class="absolute left-0 top-0 h-full rounded-full transition-[width] duration-75"
            style="background: var(--color-accent)"
            :style="{ width: progressPercent + '%' }"
          />
          <div
            class="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full shadow-sm transition-[left] duration-75"
            style="background: var(--color-accent)"
            :style="{ left: `calc(${progressPercent}% - 5px)` }"
          />
        </div>
        <span class="w-8 text-[10px] tabular-nums" style="color: var(--color-text-subtle)">
          {{ formatTime(music.duration) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.music-player {
  /* 悬浮在大背景（壁纸）上的浮动控件，用更重的玻璃：模糊加档，把背后的壁纸充分化开，
     面板更干净。仅覆盖 --glass-blur，saturate / 棱光 / 半透明配方照旧继承自 ui-surface-translucent。 */
  --glass-blur: var(--glass-blur-strong);
  z-index: var(--z-floating);
  /* 边缘折射与搜索框同级玻璃保持一致（上沿亮线 + 下沿收边），叠在原离地阴影之上；
     scoped 优先级高于 template 的 shadow-lg 工具类，故以此取代之。 */
  box-shadow: var(--glass-edge-light), var(--glass-edge-dark), var(--shadow-lg);
  left: calc(var(--spacing-6) + env(safe-area-inset-left));
  bottom: var(--home-floating-control-bottom);
}

.player-panel-open {
  /* 窄屏钳制：290px 放不下时收窄到「视口 − 左偏移 − 唱片区(56+7×2=70px) − 右侧留白」，
     保证展开后整体不伸出画面；面板内歌名自会截断/跑马灯，按钮行约 150px 起排得下。 */
  width: min(
    290px,
    calc(
      100vw - var(--spacing-6) - env(safe-area-inset-left) - 70px - var(--spacing-6) -
        env(safe-area-inset-right)
    )
  );
  padding-right: 0.875rem;
  opacity: 1;
}

.player-panel-closed {
  width: 0;
  padding-right: 0;
  opacity: 0;
}

.marquee-scroll {
  width: max-content;
  animation: marquee-scroll 8s linear infinite;
}

@keyframes marquee-scroll {
  0%,
  15% {
    transform: translateX(0);
  }
  85%,
  100% {
    transform: translateX(-50%);
  }
}

.vinyl-disc {
  transition: transform 0.3s ease;
}

.vinyl-spinning {
  animation: vinyl-rotate 8s linear infinite;
}

.vinyl-paused {
  animation-play-state: paused;
}

@keyframes vinyl-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.volume-slider {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 4px;
  height: 80px;
  appearance: none;
  background: var(--color-border);
  border-radius: var(--radius-xs);
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  cursor: pointer;
  border: none;
}
</style>
