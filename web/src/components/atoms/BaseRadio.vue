<script setup lang="ts" generic="T extends string | number | boolean">
/**
 * BaseRadio — 原子单选框（docs/design-system/06 §表单无障碍、05 §触摸目标）。
 * 与 BaseCheckbox 成对：原生 radio + 隐式 label 关联；触摸设备下扩大命中区域至 ≥44px。
 * value 为本项取值，v-model 绑定当前选中值，选中即 model === value。
 */
defineProps<{ value: T; disabled?: boolean }>();
const model = defineModel<T>();
</script>

<template>
  <label class="radio" :class="{ 'radio-disabled': disabled }">
    <input v-model="model" type="radio" :value="value" class="radio-input" :disabled="disabled" />
    <span v-if="$slots.default" class="radio-label"><slot /></span>
  </label>
</template>

<style scoped>
.radio {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: 0.875rem;
  color: var(--color-text-primary);
  cursor: pointer;
}

.radio-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.radio-input {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-accent);
  cursor: inherit;
}

.radio-input:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* 触摸设备：扩大命中区域 */
@media (pointer: coarse) {
  .radio {
    min-height: 44px;
  }
}
</style>
