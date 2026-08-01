<script setup lang="ts">
/**
 * BaseTextarea — 原子多行输入（docs/design-system/07 §Input）。
 */
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    error?: string;
    rows?: number;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
  }>(),
  { rows: 2, required: false, disabled: false },
);

const model = defineModel<string | null>();

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

    <textarea
      :id="uid"
      v-model="model"
      :rows="rows"
      class="ui-field field-input"
      :class="{ 'field-invalid': error }"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? errorId : hint ? hintId : undefined"
      v-bind="$attrs"
    />

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

.field-input {
  width: 100%;
  resize: vertical;
}

.field-invalid {
  border-color: var(--color-danger) !important;
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
