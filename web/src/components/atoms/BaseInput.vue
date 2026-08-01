<script setup lang="ts">
/**
 * BaseInput — 原子输入框（docs/design-system/07 §Input、03 §输入框微交互、06 §表单无障碍）。
 * 受控 v-model；可选 label/hint/error；error 时 aria-invalid + role=alert。
 * #append 插槽用于并排操作（如「抓取」按钮），避免破坏紧凑布局。
 */
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    error?: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
  }>(),
  { type: 'text', required: false, disabled: false, size: 'md' },
);

const model = defineModel<string | number | null>();
const emit = defineEmits<{ blur: [] }>();

const { t } = useI18n();
const uid = useId();
const errorId = `${uid}-error`;
const hintId = `${uid}-hint`;
</script>

<template>
  <div class="field">
    <label v-if="label" :for="uid" class="field-label">
      {{ label }}
      <span v-if="required" class="field-required" :aria-label="t('common.required')">*</span>
    </label>

    <div class="field-row">
      <input
        :id="uid"
        v-model="model"
        :type="type"
        :class="[
          size === 'sm' ? 'ui-field-sm' : 'ui-field',
          'field-input',
          { 'field-invalid': error, 'ui-search': type === 'search' },
        ]"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? errorId : hint ? hintId : undefined"
        v-bind="$attrs"
        @blur="emit('blur')"
      />
      <slot name="append" />
    </div>

    <p v-if="error" :id="errorId" class="field-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="field-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.field-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.field-required {
  color: var(--color-danger);
}

.field-row {
  display: flex;
  gap: var(--spacing-2);
  align-items: center;
}

.field-input {
  min-width: 0;
  flex: 1;
}

.field-invalid {
  border-color: var(--color-danger) !important;
}

.field-invalid:focus {
  box-shadow: 0 0 0 var(--focus-ring-width) color-mix(in srgb, var(--color-danger) 20%, transparent) !important;
}

.field-error {
  font-size: 0.75rem;
  color: var(--color-danger);
}

.field-hint {
  font-size: 0.75rem;
  color: var(--color-text-subtle);
}
</style>
