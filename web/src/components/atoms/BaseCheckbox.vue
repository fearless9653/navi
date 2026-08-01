<script setup lang="ts">
/**
 * BaseCheckbox — 原子复选框（docs/design-system/06 §表单无障碍、05 §触摸目标）。
 * 原生 checkbox + 隐式 label 关联；触摸设备下扩大可点击区域至 ≥44px。
 */
defineProps<{ disabled?: boolean }>();
const model = defineModel<boolean>({ default: false });
</script>

<template>
  <label class="checkbox" :class="{ 'checkbox-disabled': disabled }">
    <input v-model="model" type="checkbox" class="checkbox-input" :disabled="disabled" />
    <span v-if="$slots.default" class="checkbox-label"><slot /></span>
  </label>
</template>

<style scoped>
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: 0.875rem;
  color: var(--color-text-primary);
  cursor: pointer;
}

.checkbox-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-accent);
  cursor: inherit;
}

.checkbox-input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* 触摸设备：扩大命中区域 */
@media (pointer: coarse) {
  .checkbox {
    min-height: 44px;
  }
}
</style>
