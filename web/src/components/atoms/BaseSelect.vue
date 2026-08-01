<script setup lang="ts" generic="T extends string | number">
/**
 * BaseSelect — 字段样式的单选下拉（docs/design-system/07 §Input）。
 * 内部基于 BaseListbox（自绘 listbox 底座），不再用原生 <select>：
 * 双端一致、可主题化，移动端不再弹系统 picker。
 * 触发器复用 ui-field / ui-field-sm 字段样式，右侧统一用 BaseChevron 自绘箭头。
 * chevron 能感知展开态并翻转（原生 select 无法感知，故旧实现不敢翻转）。
 *
 * 选项经 :options 传入（[{ value, label, disabled? }]）；旧的 <option> 插槽已移除。
 * 属性透传：inheritAttrs=false。class/style 落到外层浮层包装（布局归容器），
 * 其余（id / data-* / aria-label 等）转发到触发器按钮（label for、测试选择器可用）。
 * block 时占满宽度（表单场景）。
 */
import { computed, useAttrs } from 'vue';
import BaseListbox, { type ListboxOption } from '@/components/molecules/BaseListbox.vue';
import BaseChevron from './BaseChevron.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    options: ListboxOption<T>[];
    size?: 'sm' | 'md';
    disabled?: boolean;
    block?: boolean;
    /** 无选中项时占位文本。 */
    placeholder?: string;
  }>(),
  { size: 'md', disabled: false, block: false, placeholder: '' },
);

const model = defineModel<T | null>();
// change 事件携带新值，对齐旧的原生 select @change 用法，便于调用点迁移。
const emit = defineEmits<{ change: [T] }>();

// #option 插槽透传到 BaseListbox：字体选择等需按选项值自定义渲染（字体预览）。
defineSlots<{
  option?: (props: { option: ListboxOption<T>; selected: boolean; active: boolean }) => unknown;
}>();

const attrs = useAttrs();

const wrapperClass = computed(() => [
  'base-select',
  { 'base-select-block': props.block },
  attrs.class,
]);

const triggerClass = computed(
  () => `${props.size === 'sm' ? 'ui-field-sm' : 'ui-field'} base-select__trigger`,
);

// 非 class/style 的属性（id / data-* / aria-label）转发到触发器按钮。
const forwardAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <BaseListbox
    v-bind="forwardAttrs"
    v-model="model"
    :class="wrapperClass"
    :style="attrs.style as string | undefined"
    :options="options"
    :disabled="disabled"
    :placeholder="placeholder"
    :trigger-class="triggerClass"
    match-trigger-width
    @change="(v: T) => emit('change', v)"
  >
    <template #trigger="{ selected, open }">
      <span class="base-select__label">{{ selected?.label ?? placeholder }}</span>
      <!-- 统一的自绘箭头；配色（默认次要色 / 展开强调色）经 color 传给 currentColor 着色的 chevron。 -->
      <BaseChevron :open="open" class="base-select__chevron" :class="{ 'is-open': open }" />
    </template>

    <!-- 透传 #option 插槽（字体预览等自定义选项渲染）；未提供时 BaseListbox 缺省渲染 label。 -->
    <template v-if="$slots.option" #option="slotProps">
      <slot name="option" v-bind="slotProps" />
    </template>
  </BaseListbox>
</template>

<style scoped>
/* 触发器：字段样式（ui-field*）之上补 flex 布局，label 左、chevron 右。 */
.base-select :deep(.base-select__trigger) {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  text-align: left;
}

.base-select-block,
.base-select-block :deep(.base-select__trigger) {
  display: flex;
  width: 100%;
}

.base-select__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* BaseChevron 用 currentColor 着色并自带翻转，这里只控制配色。 */
.base-select__chevron {
  color: var(--color-text-secondary);
  transition: color var(--duration-base) var(--ease-out);
}
.base-select__chevron.is-open {
  color: var(--color-accent);
}
</style>
