<script setup lang="ts" generic="T extends string | number">
/**
 * BaseListbox — 自绘单选下拉（listbox 底座）。
 * 在 BaseDropdown 浮层原语之上补齐 listbox 语义，替代原生 <select>，双端一致、可主题化。
 *
 * 为什么自绘：原生 <select> 在移动端弹系统 picker（iOS 滚轮 / Android 弹窗），
 * 吃不到主题/暗色/自定义渲染，视觉割裂；且原生无法感知展开态，chevron 无法翻转。
 *
 * 无障碍（ARIA 1.2 「Select-Only Combobox」模式）：
 * - 触发器 role=combobox + aria-haspopup=listbox + aria-expanded + aria-controls + aria-activedescendant
 * - 浮层 role=listbox，选项 role=option + aria-selected
 * - 焦点始终留在触发器按钮上，用 aria-activedescendant 指向高亮项（不逐项移焦，roving 由 activeIndex 承担）
 * - 键盘：闭合时 ↑↓/Enter/Space/可打印字符 打开；展开时 ↑↓ 移动、Home/End 首末、
 *   Enter/Space 选定、Esc 关闭回焦、Tab 关闭放行、可打印字符 typeahead
 *
 * 渲染定制：#trigger 插槽自定义触发器内容（引擎 favicon / 字段样式由调用方经 triggerClass 提供），
 * #option 插槽自定义选项内容（引擎 favicon / 字体预览）。缺省渲染 label 文本。
 *
 * 属性透传：inheritAttrs=false。class/style 落到外层包装（布局归容器），
 * 其余（id / data-* / aria-label 等）转发到触发器按钮（label for、测试选择器可用）。
 */
import { computed, nextTick, ref, useAttrs } from 'vue';
import BaseDropdown from './BaseDropdown.vue';

export interface ListboxOption<V extends string | number = string | number> {
  value: V;
  label: string;
  disabled?: boolean;
}

// 模块级自增 id 计数器（须在 setup 使用前定义，避免 let 的暂时性死区）。
let uidCounter = 0;
function nextUid(): number {
  return ++uidCounter;
}

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    options: ListboxOption<T>[];
    /** 自定义触发器按钮的样式类（字段样式 / 引擎样式由调用方提供）。 */
    triggerClass?: string;
    /** 菜单宽度对齐触发器（表单场景）。 */
    matchTriggerWidth?: boolean;
    align?: 'left' | 'right';
    disabled?: boolean;
    /** 无选中项时触发器占位文本。 */
    placeholder?: string;
  }>(),
  { triggerClass: '', matchTriggerWidth: false, align: 'left', disabled: false, placeholder: '' },
);

const model = defineModel<T | null>();
// change 事件携带新值，便于迁移旧的 @change 用法（原生 select 的 change）。
const emit = defineEmits<{ change: [T] }>();

const attrs = useAttrs();
const buttonAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

// 唯一 id：不依赖 vue 版本的 useId，用模块计数器自增，保证 aria-controls / activedescendant 稳定。
const uid = nextUid();
const listboxId = `listbox-${uid}`;
const optionId = (i: number): string => `${listboxId}-opt-${i}`;

const dropdown = ref<InstanceType<typeof BaseDropdown> | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeIndex = ref(-1);

const selected = computed(() => props.options.find((o) => o.value === model.value) ?? null);
const selectedIndex = computed(() => props.options.findIndex((o) => o.value === model.value));

function firstEnabledIndex(): number {
  return props.options.findIndex((o) => !o.disabled);
}
function lastEnabledIndex(): number {
  for (let i = props.options.length - 1; i >= 0; i--) {
    if (!props.options[i]?.disabled) return i;
  }
  return -1;
}

function scrollActiveIntoView(): void {
  if (activeIndex.value < 0) return;
  void nextTick(() => {
    const el = document.getElementById(optionId(activeIndex.value));
    // scrollIntoView 在 jsdom 中未实现，防御性判断（测试环境）。
    el?.scrollIntoView?.({ block: 'nearest' });
  });
}

function setActive(i: number): void {
  if (i < 0 || i >= props.options.length || props.options[i]?.disabled) return;
  activeIndex.value = i;
  scrollActiveIntoView();
}

/** 从 from 出发按 dir 找下一个可选项（不环绕）。 */
function moveActive(dir: 1 | -1): void {
  const n = props.options.length;
  let i = activeIndex.value;
  for (let step = 0; step < n; step++) {
    i += dir;
    if (i < 0 || i >= n) return; // 到边界停住（不环绕）
    if (!props.options[i]?.disabled) {
      setActive(i);
      return;
    }
  }
}

function onOpen(): void {
  open.value = true;
  // 展开时高亮当前选中项；无选中则首个可选项。
  const start = selectedIndex.value >= 0 ? selectedIndex.value : firstEnabledIndex();
  activeIndex.value = start;
  scrollActiveIntoView();
}
function onClose(): void {
  open.value = false;
  resetTypeahead();
}

function selectAt(i: number): void {
  const opt = props.options[i];
  if (!opt || opt.disabled) return;
  model.value = opt.value;
  emit('change', opt.value);
  dropdown.value?.close();
  triggerRef.value?.focus();
}

// ── typeahead：累积按键前缀匹配 label，500ms 静默后清空缓冲 ──
let typeaheadBuffer = '';
let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
function resetTypeahead(): void {
  typeaheadBuffer = '';
  if (typeaheadTimer) clearTimeout(typeaheadTimer);
  typeaheadTimer = undefined;
}
function onType(char: string): void {
  typeaheadBuffer += char.toLowerCase();
  if (typeaheadTimer) clearTimeout(typeaheadTimer);
  typeaheadTimer = setTimeout(resetTypeahead, 500);

  const n = props.options.length;
  // 单字符：从当前项之后开始找（支持同首字母循环）；多字符：从当前项开始找。
  const from = typeaheadBuffer.length === 1 ? activeIndex.value + 1 : activeIndex.value;
  for (let step = 0; step < n; step++) {
    const i = (from + step + n) % n;
    const opt = props.options[i];
    if (opt && !opt.disabled && opt.label.toLowerCase().startsWith(typeaheadBuffer)) {
      setActive(i);
      return;
    }
  }
}

function onTriggerKeydown(e: KeyboardEvent): void {
  if (props.disabled) return;
  const key = e.key;

  if (!open.value) {
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
      e.preventDefault();
      dropdown.value?.open();
      return;
    }
    if (isTypeaheadChar(e)) {
      e.preventDefault();
      dropdown.value?.open();
      // 展开后 onOpen 已设初始 active，再应用 typeahead。
      void nextTick(() => onType(key));
      return;
    }
    return;
  }

  // 展开态
  switch (key) {
    case 'ArrowDown':
      e.preventDefault();
      moveActive(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      moveActive(-1);
      break;
    case 'Home':
      e.preventDefault();
      setActive(firstEnabledIndex());
      break;
    case 'End':
      e.preventDefault();
      setActive(lastEnabledIndex());
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (activeIndex.value >= 0) selectAt(activeIndex.value);
      break;
    case 'Escape':
      e.preventDefault();
      dropdown.value?.close();
      triggerRef.value?.focus();
      break;
    case 'Tab':
      // 放行 Tab（焦点移出），仅关闭浮层。
      dropdown.value?.close();
      break;
    default:
      if (isTypeaheadChar(e)) {
        e.preventDefault();
        onType(key);
      }
  }
}

function isTypeaheadChar(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}
</script>

<template>
  <BaseDropdown
    ref="dropdown"
    :class="attrs.class"
    :style="attrs.style as string | undefined"
    :align="align"
    :match-trigger-width="matchTriggerWidth"
    @open="onOpen"
    @close="onClose"
  >
    <template #trigger="{ toggle }">
      <button
        ref="triggerRef"
        type="button"
        role="combobox"
        class="listbox-trigger"
        :class="triggerClass"
        :disabled="disabled"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
        v-bind="buttonAttrs"
        @click="toggle"
        @keydown="onTriggerKeydown"
      >
        <slot name="trigger" :selected="selected" :open="open">
          <span class="listbox-trigger__label">{{ selected?.label ?? placeholder }}</span>
        </slot>
      </button>
    </template>

    <template #default>
      <ul :id="listboxId" role="listbox" class="listbox" :aria-activedescendant="undefined">
        <li
          v-for="(opt, i) in options"
          :id="optionId(i)"
          :key="opt.value"
          role="option"
          class="listbox-option"
          :class="{
            'listbox-option--active': i === activeIndex,
            'listbox-option--selected': opt.value === model,
            'listbox-option--disabled': opt.disabled,
          }"
          :aria-selected="opt.value === model"
          :aria-disabled="opt.disabled || undefined"
          @click="!opt.disabled && selectAt(i)"
          @mousemove="!opt.disabled && (activeIndex = i)"
        >
          <slot
            name="option"
            :option="opt"
            :selected="opt.value === model"
            :active="i === activeIndex"
          >
            {{ opt.label }}
          </slot>
        </li>
      </ul>
    </template>
  </BaseDropdown>
</template>

<style scoped>
/* 悬浮反馈：边框转强调色（与字段 focus 态同源，但更轻），提示可交互——不用小手指光标。
   触发器边框来自消费方（ui-field* / engine-trigger），故只调 border-color；
   补 transition 因 engine-trigger 无自带过渡（ui-field* 已有，重复声明无害）。 */
.listbox-trigger {
  transition: border-color var(--duration-base) var(--ease-out);
}
.listbox-trigger:not(:disabled):hover {
  border-color: var(--color-accent);
}
.listbox-trigger:disabled {
  cursor: not-allowed;
}
.listbox-trigger__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.listbox {
  max-height: 16rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--spacing-1) 0;
}

.listbox-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-1-5);
  padding: var(--spacing-1-5) var(--spacing-3);
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-text-primary);
  user-select: none;
}

/* 触控设备：加大点选目标至 ≥44px（原生 picker 的触控优势自绘补回）。 */
@media (pointer: coarse) {
  .listbox-option {
    min-height: 44px;
  }
}

/* 键盘/悬停高亮（active 由键盘导航或 mousemove 驱动）。 */
.listbox-option--active {
  background-color: var(--color-row-hover);
}

.listbox-option--selected {
  font-weight: 500;
  color: var(--color-accent);
}

.listbox-option--disabled {
  color: var(--color-text-faint);
  cursor: not-allowed;
}
</style>
