<script setup lang="ts">
/**
 * BaseSpinner — 旋转加载指示器（docs/design-system/03 §加载状态）。
 * 纯装饰，调用方在交互元素上提供 aria-busy / aria-label。
 */
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' });
</script>

<template>
  <span class="spinner" :class="`spinner-${size}`" aria-hidden="true" />
</template>

<style scoped>
.spinner {
  display: inline-block;
  border-style: solid;
  border-color: color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  border-radius: var(--radius-full);
  animation: spinner-rotate 600ms linear infinite;
}

.spinner-sm {
  width: 0.875rem;
  height: 0.875rem;
  border-width: 2px;
}

.spinner-md {
  width: 1.125rem;
  height: 1.125rem;
  border-width: 2px;
}

.spinner-lg {
  width: 1.5rem;
  height: 1.5rem;
  border-width: 3px;
}

@keyframes spinner-rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
