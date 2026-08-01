<script setup lang="ts">
/**
 * BaseBadge — 原子徽章/标签（docs/design-system/07 §Badge）。
 * 变体语义色 + 尺寸；xs 用于书签卡片等密集场景（可叠加 truncate/max-w 由父级控制）。
 */
withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
    size?: 'xs' | 'sm';
  }>(),
  { variant: 'default', size: 'sm' },
);
</script>

<template>
  <span class="badge" :class="[`badge-${variant}`, `badge-${size}`]">
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  font-weight: 500;
  line-height: 1;
}

.badge-sm {
  padding: 0.125rem var(--spacing-2);
  font-size: 0.75rem;
}

.badge-xs {
  height: 1rem;
  padding-block: 0;
  padding-inline: var(--spacing-1-5);
  font-size: 0.625rem;
  line-height: 1rem;
}

.badge-default {
  background-color: var(--color-surface-muted);
  color: var(--color-text-secondary);
}

.badge-primary {
  background-color: var(--color-accent-light);
  color: var(--color-accent);
}

.badge-success {
  background-color: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
}

.badge-warning {
  background-color: color-mix(in srgb, var(--color-warning) 12%, transparent);
  color: var(--color-warning);
}

.badge-danger {
  background-color: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
}
</style>
