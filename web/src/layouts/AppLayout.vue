<script lang="ts">
let logoHoverSuppressedAfterActivation = false;
</script>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { usePrefsStore } from '@/stores/prefs';
import { useBackground } from '@/composables/useBackground';
import AccountMenu from '@/components/layout/AccountMenu.vue';
import { AppLogo } from '@/components/atoms';

const { t } = useI18n();
const auth = useAuthStore();
const prefs = usePrefsStore();
const suppressLogoHover = ref(logoHoverSuppressedAfterActivation);
const {
  backgroundStyle,
  overlayStyle,
  hasBackground,
  imageLoaded,
  handleImageLoad,
  handleImageError,
} = useBackground();

// 从 backgroundStyle 提取真实的图片 URL
const backgroundImageUrl = computed(() => {
  const bgImage = backgroundStyle.value.backgroundImage;
  if (!bgImage) return '';
  // 移除 url('...') 或 url("...") 包装
  return bgImage.replace(/^url\(['"]?(.+?)['"]?\)$/, '$1');
});

function suppressLogoHoverAfterActivation(): void {
  logoHoverSuppressedAfterActivation = true;
  suppressLogoHover.value = true;
}

function releaseLogoHoverSuppression(): void {
  logoHoverSuppressedAfterActivation = false;
  suppressLogoHover.value = false;
}

// 加载用户偏好设置（用于背景图片）
onMounted(async () => {
  if (auth.isAuthed && !prefs.prefs) {
    await prefs.load();
  }
});
</script>

<template>
  <a href="#main-content" class="skip-link">跳过导航</a>
  <div
    class="relative flex min-h-dvh flex-col ui-text"
    :class="hasBackground ? 'bg-transparent' : ''"
    :style="hasBackground ? {} : { backgroundColor: 'var(--color-background)' }"
  >
    <!-- 背景图片层：fixed 定位，最底层 -->
    <div
      v-if="hasBackground"
      class="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat transition-opacity duration-500"
      :class="{ 'opacity-100': imageLoaded, 'opacity-0': !imageLoaded }"
      :style="backgroundStyle"
    >
      <!-- 隐藏的 img 元素用于监听加载事件 -->
      <img
        v-if="backgroundImageUrl"
        :src="backgroundImageUrl"
        class="hidden"
        @load="handleImageLoad"
        @error="handleImageError"
      />
    </div>

    <!-- 透明遮罩层：覆盖在背景图上，响应主题切换 -->
    <div
      v-if="hasBackground"
      class="fixed inset-0 -z-9 transition-colors duration-300"
      :style="overlayStyle"
    />

    <!-- 原有内容 -->
    <header class="flex shrink-0 items-center justify-between px-4 py-1.5">
      <RouterLink
        :to="{ name: 'home' }"
        class="app-logo-link flex items-center"
        :class="{ 'app-logo-hover-suppressed': suppressLogoHover }"
        @click="suppressLogoHoverAfterActivation"
        @pointerleave="releaseLogoHoverSuppression"
      >
        <AppLogo class="app-logo-image h-8 w-8" />
        <span aria-hidden="true" class="app-logo-shine" />
      </RouterLink>
      <!-- min-h 锁定为登录态内容（AccountMenu 触发器 36px）的高度：游客的登录链接只有 32px，
           不锁的话 header 会随登录态高 4px / 矮 4px，令下方整页内容（含首页搜索框）垂直位置跳动。 -->
      <nav class="flex min-h-9 items-center gap-1">
        <AccountMenu v-if="auth.isAuthed" />
        <RouterLink
          v-else
          :to="{ name: 'login' }"
          class="rounded-lg px-2 py-1.5 text-sm ui-button-ghost"
        >
          {{ t('auth.login') }}
        </RouterLink>
      </nav>
    </header>
    <main
      id="main-content"
      tabindex="-1"
      class="mx-auto flex w-full flex-1 flex-col px-4 py-3 max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[1920px]"
    >
      <slot />
    </main>
  </div>
</template>

<style scoped>
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  z-index: var(--z-skip-link);
  padding: 8px 16px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-size: 0.875rem;
  border-radius: 0 0 var(--radius-base) 0;
  text-decoration: none;
}

.skip-link:focus {
  top: 0;
}

/* main 仅作为 skip-link 的编程式焦点目标（tabindex="-1"）；
 * 鼠标点击内容空白会把焦点落到它上面，此后任意按键（如 Shift）会触发
 * :focus-visible 升级，浏览器给整个内容区画出 UA 默认焦点环 —— 抑制之。 */
#main-content:focus,
#main-content:focus-visible {
  outline: none;
}

.app-logo-link {
  --app-logo-shine-color: rgb(255 255 255);
  position: relative;
  display: inline-flex;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

.app-logo-image {
  position: relative;
  z-index: 1;
}

.app-logo-shine {
  position: absolute;
  inset: -35%;
  z-index: 2;
  background: linear-gradient(
    135deg,
    transparent 35%,
    color-mix(in srgb, var(--app-logo-shine-color) 18%, transparent) 45%,
    color-mix(in srgb, var(--app-logo-shine-color) 72%, transparent) 50%,
    color-mix(in srgb, var(--app-logo-shine-color) 18%, transparent) 55%,
    transparent 65%
  );
  opacity: 0;
  pointer-events: none;
  transform: translate(-140%, 140%) rotate(-10deg);
}

.app-logo-link:hover .app-logo-shine {
  opacity: 1;
  animation: logo-shine var(--duration-slow) var(--ease-out);
}

.app-logo-link.app-logo-hover-suppressed:hover .app-logo-shine {
  opacity: 0;
  animation: none;
}

.app-logo-link:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

@keyframes logo-shine {
  from {
    transform: translate(-140%, 140%) rotate(-10deg);
  }

  to {
    transform: translate(140%, -140%) rotate(-10deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-logo-link:hover .app-logo-shine {
    opacity: 0;
    animation: none;
  }
}
</style>
