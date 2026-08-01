<script setup lang="ts">
/**
 * BaseChevron — 统一的下拉指示箭头（自绘 chevron）。
 * 各类下拉触发器（BaseSelect / EngineSelector / TagCascadePopover 等）共用此符号，
 * 取代散落各处的字面量 ▾，保证形状/描边一致、可主题化（用 currentColor 系的 mask 着色）。
 * open 时旋转 180° 反映展开态（原生 <select> 无法感知，故仅自绘下拉可用）。
 * 纯装饰：aria-hidden，语义由触发器的 aria-expanded 承担。
 */
withDefaults(defineProps<{ open?: boolean; size?: string }>(), {
  open: false,
  size: '0.75rem',
});
</script>

<template>
  <span
    class="base-chevron"
    :class="{ 'base-chevron--open': open }"
    :style="{ width: size, height: size }"
    aria-hidden="true"
  />
</template>

<style scoped>
.base-chevron {
  flex: none;
  display: inline-block;
  background-color: currentColor;
  mask: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Cpath%20d='M6%209l6%206%206-6'%20fill='none'%20stroke='black'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E")
    center / contain no-repeat;
  -webkit-mask: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%3E%3Cpath%20d='M6%209l6%206%206-6'%20fill='none'%20stroke='black'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E")
    center / contain no-repeat;
  transition: transform var(--duration-base) var(--ease-out);
}

.base-chevron--open {
  transform: rotate(180deg);
}
</style>
