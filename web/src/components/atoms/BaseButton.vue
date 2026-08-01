<script setup lang="ts">
/**
 * BaseButton — 原子按钮（docs/design-system/07 §Button、03 §按钮微交互）。
 * 变体 × 尺寸矩阵 + loading/disabled + 图标插槽；token 驱动、focus-visible 可见、
 * 尊重 prefers-reduced-motion。
 */
import BaseSpinner from './BaseSpinner.vue';

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    block?: boolean;
    iconOnly?: boolean;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    block: false,
    iconOnly: false,
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

function onClick(e: MouseEvent): void {
  emit('click', e);
}
</script>

<template>
  <button
    class="btn"
    :class="[
      `btn-${variant}`,
      `btn-${size}`,
      { 'btn-block': block, 'btn-icon': iconOnly, 'btn-loading': loading },
    ]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="onClick"
  >
    <BaseSpinner v-if="loading" :size="size === 'lg' ? 'md' : 'sm'" class="btn-spinner" />
    <slot v-if="!loading" name="leading" />
    <span v-if="!iconOnly" class="btn-label"><slot /></span>
    <slot v-else />
    <slot v-if="!loading" name="trailing" />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  border: 1px solid transparent;
  border-radius: var(--radius-base);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* 尺寸 */
.btn-sm {
  height: 2rem;
  padding: 0 var(--spacing-3);
  font-size: 0.875rem;
}
.btn-md {
  height: 2.5rem;
  padding: 0 var(--spacing-4);
  font-size: 1rem;
}
.btn-lg {
  height: 3rem;
  padding: 0 var(--spacing-6);
  font-size: 1.125rem;
}

.btn-icon {
  padding: 0;
  aspect-ratio: 1 / 1;
}
.btn-icon.btn-sm {
  width: 2rem;
}
.btn-icon.btn-md {
  width: 2.5rem;
}
.btn-icon.btn-lg {
  width: 3rem;
}

.btn-block {
  width: 100%;
}

/* 变体 */
.btn-primary {
  background-color: var(--color-accent);
  color: var(--color-on-accent);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-accent-hover);
  box-shadow: var(--shadow-action-hover);
}

.btn-secondary {
  background-color: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}
.btn-secondary:hover:not(:disabled) {
  background-color: var(--color-surface-muted);
  border-color: color-mix(in srgb, var(--color-accent) 30%, var(--color-border));
  box-shadow: var(--shadow-base);
}

.btn-ghost {
  background-color: transparent;
  color: var(--color-text-secondary);
}
.btn-ghost:hover:not(:disabled) {
  background-color: var(--color-surface-muted);
}

.btn-danger {
  background-color: var(--color-danger);
  color: var(--color-on-danger);
}
.btn-danger:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--color-danger) 85%, black);
  box-shadow: var(--shadow-danger-hover);
}

/* 状态 */
.btn:active:not(:disabled) {
  transform: scale(0.98);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-loading {
  cursor: progress;
}

@media (prefers-reduced-motion: reduce) {
  .btn:hover:not(:disabled),
  .btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
