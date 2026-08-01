<script setup lang="ts">
import { useId } from 'vue';

/**
 * AppLogo — 内联的 Navi 品牌标识（原 web/public/favicon.svg）。
 * 内联而非 <img src>：布局重挂载时不重建 img、不触发 favicon.svg 的 no-cache 回源校验，
 * 消除慢网下「logo 闪一下消失再显示」。改图标时与 web/public/favicon.svg 两处同步。
 *
 * 渐变 id 用 useId() 生成，保证多实例（如同页多处 logo）内联 SVG 不因同名 id 冲突。
 */
withDefaults(defineProps<{ label?: string }>(), { label: 'Navi' });

// SVG defs 的 id 全局生效，同名会互相污染填充；useId 保证每个实例唯一。
const gradId = `app-logo-bg-grad-${useId()}`;
</script>

<template>
  <svg viewBox="0 0 32 32" role="img" :aria-label="label">
    <defs>
      <linearGradient :id="gradId" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4DA6FF" />
        <stop offset="100%" stop-color="#0066CC" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" :fill="`url(#${gradId})`" />
    <path d="M16 5l8 22-8-5-8 5z" fill="#FFFFFF" transform="rotate(-45, 12, 18)" />
  </svg>
</template>
