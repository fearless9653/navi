<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEnginesStore } from '@/stores/engines';
import { looksLikeUrl, useSearchSuggest } from '@/composables/useSearchSuggest';
import EngineSelector from './EngineSelector.vue';

const { t } = useI18n();
const engines = useEnginesStore();
const q = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const focused = ref(false);
const listId = 'home-search-suggest';

const currentEngine = computed(
  () => engines.engines.find((e) => e.id === engines.currentId) ?? null,
);
const engineId = computed(() => currentEngine.value?.id ?? null);
const suggestSource = computed(() => currentEngine.value?.suggestSource ?? null);

const {
  suggestions,
  open: suggestOpen,
  activeIndex,
  close: closeSuggest,
  moveActive,
  takeActive,
} = useSearchSuggest({
  query: q,
  engineId,
  suggestSource,
});

function optionId(index: number): string {
  return `${listId}-opt-${index}`;
}

function submit(): void {
  const text = q.value.trim();
  if (!text) return;
  closeSuggest();
  // 已是网址 → 直接跳转，不走搜索引擎
  if (looksLikeUrl(text)) {
    const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    window.open(href, '_blank', 'noopener');
    q.value = '';
    return;
  }
  const url = engines.searchUrl(text);
  if (url) {
    window.open(url, '_blank', 'noopener');
    q.value = '';
  }
}

function choose(term: string): void {
  q.value = term;
  closeSuggest();
  submit();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    if (suggestOpen.value) {
      e.preventDefault();
      moveActive(1);
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    if (suggestOpen.value) {
      e.preventDefault();
      moveActive(-1);
    }
    return;
  }
  if (e.key === 'Enter') {
    const term = takeActive();
    if (term) {
      e.preventDefault();
      choose(term);
    }
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (suggestOpen.value) {
      closeSuggest();
      return;
    }
    onEscape();
  }
}

/** Esc：列表已关时清空并失焦，退回「页面级」快捷键状态（与 / 聚焦形成闭环）。 */
function onEscape(): void {
  q.value = '';
  inputRef.value?.blur();
}

function onBlur(): void {
  focused.value = false;
  closeSuggest();
}

/** 供快捷键（/、Ctrl+K）调用：聚焦并全选，便于覆盖输入；滚回视口内。 */
function focusInput(): void {
  const el = inputRef.value;
  if (!el) return;
  el.focus();
  el.select();
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

defineExpose({ focusInput });
</script>

<template>
  <div class="search-wrap w-full max-w-2xl md:max-w-3xl xl:max-w-[52rem]">
    <form
      class="search-bar ui-surface-translucent w-full"
      role="search"
      :aria-label="t('home.webSearch')"
      @submit.prevent="submit"
    >
      <!-- self-stretch 透传到 BaseDropdown 根 div，使触发按钮（h-full）随搜索条高度伸展 -->
      <EngineSelector class="self-stretch" />
      <!-- 回车即搜；无独立搜索按钮 -->
      <input
        ref="inputRef"
        v-model="q"
        type="search"
        :placeholder="t('home.webSearch')"
        :aria-label="t('home.webSearch')"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="suggestOpen && suggestions.length > 0"
        :aria-controls="listId"
        :aria-activedescendant="
          activeIndex >= 0 ? optionId(activeIndex) : undefined
        "
        aria-keyshortcuts="/ Control+K"
        class="ui-search min-w-0 flex-1 rounded-r-[2rem] bg-transparent px-4 py-3.5 text-base outline-none md:py-4 md:text-[1.0625rem]"
        @focus="focused = true"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <!-- 键位提示：未聚焦时展示，提示 / 可快速聚焦（GitHub 惯例） -->
      <kbd v-if="!focused" class="ui-kbd search-kbd" aria-hidden="true">/</kbd>
    </form>
    <ul
      v-if="suggestOpen && suggestions.length"
      :id="listId"
      class="suggest-panel ui-surface-translucent"
      role="listbox"
      :aria-label="t('home.searchSuggest')"
    >
      <li
        v-for="(term, i) in suggestions"
        :id="optionId(i)"
        :key="`${i}-${term}`"
        role="option"
        class="suggest-option"
        :class="{ 'suggest-option--active': i === activeIndex }"
        :aria-selected="i === activeIndex"
        @mousedown.prevent="choose(term)"
      >
        {{ term }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search-wrap {
  position: relative;
  /* 与 EngineSelector 触发器宽度同源，建议列表从输入框左缘起，不从引擎选择器起。 */
  --engine-trigger-width: 7rem;
}

.search-bar {
  /* 首页视觉焦点，悬浮在壁纸上的浮动控件，用更重的玻璃（与音乐播放器同级）。
     仅覆盖 --glass-blur，saturate / 棱光 / 半透明配方照旧继承自 ui-surface-translucent。 */
  --glass-blur: var(--glass-blur-strong);
  /* 宽度由模板上的响应式类控制（max-w-2xl / md:max-w-3xl / xl:max-w-[52rem]），此处不重复声明 */
  display: flex;
  align-items: center;
  /* 搜索条单独加大圆角（不复用全站 --radius-xl，避免牵动 Modal/Pagination），
     左右两段的 rounded-l/r-[2rem] 与此保持一致。 */
  border-radius: var(--radius-2xl);
  border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  /* 边缘折射（上亮下暗）+ 离地阴影：边缘方向光是玻璃感的关键一层，
     与 ui-surface-translucent 的 --glass-sheen 棱光共同构成「光从上方打来」。 */
  box-shadow: var(--glass-edge-light), var(--glass-edge-dark), var(--shadow-md);
  transition:
    border-color var(--duration-medium) var(--ease-out),
    box-shadow var(--duration-medium) var(--ease-out);
  /* 进场：组件挂载即渐现，像朋友先抬眼再开口——比生硬直出更细腻。
     仅动 opacity/translate，不碰 box-shadow，与上面 :focus-within 过渡互不干扰。
     prefers-reduced-motion 由 style.css 全局守卫归零，此处不重复声明。 */
  animation: search-bar-enter var(--duration-slow) var(--ease-out) both;
}

@keyframes search-bar-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 玻璃被点亮的基础反馈（鼠标点入 / 键盘聚焦都触发）：顶部高光加强 + 内描边/内发光
   + 离地阴影。刻意不含焦点环——鼠标点入时让玻璃保持纯净，不套蓝圈。 */
.search-bar:focus-within {
  border-color: var(--color-accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent),
    inset 0 0 18px color-mix(in srgb, var(--color-accent) 12%, transparent),
    var(--shadow-lg);
}

/* 仅键盘聚焦（Tab / / Ctrl+K）才追加无障碍焦点环。:focus-visible 只在「键盘导航获得焦点」
   时匹配、鼠标点击不匹配；用 :has 让不可聚焦的 form 容器感知内部 input 的键盘焦点。
   两条规则特异性相同，本条在后故键盘时胜出 → 在基础反馈之上叠出 ring。需 :has 支持。 */
.search-bar:has(input:focus-visible) {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 35%, transparent),
    inset 0 0 18px color-mix(in srgb, var(--color-accent) 12%, transparent),
    0 0 0 var(--focus-ring-width) var(--color-focus-ring),
    var(--shadow-lg);
}

.search-kbd {
  margin-right: var(--spacing-4);
  flex-shrink: 0;
}

/* 建议列表叠在搜索条下方。z-index 用 --z-dropdown，低于引擎选择器传送到 body 的浮层
  （calc(var(--z-dropdown) + 1)），避免挡住引擎下拉。 */
.suggest-panel {
  --glass-blur: var(--glass-blur-strong);
  position: absolute;
  z-index: var(--z-dropdown);
  top: calc(100% + var(--spacing-2));
  right: 0;
  left: var(--engine-trigger-width);
  /* 上游最多返回 10 条，高度随内容撑开；overflow 只裁切圆角，不出现滚动条。 */
  overflow: hidden;
  margin: 0;
  padding: var(--spacing-1) 0;
  list-style: none;
  border-radius: var(--radius-xl);
  border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  box-shadow: var(--glass-edge-light), var(--glass-edge-dark), var(--shadow-md);
}

.suggest-option {
  padding: var(--spacing-1) var(--spacing-4);
  font-size: 0.9375rem;
  line-height: 1.25;
  color: var(--color-text-primary);
  cursor: pointer;
  user-select: none;
}

@media (pointer: coarse) {
  .suggest-option {
    min-height: 44px;
  }
}

.suggest-option:hover,
.suggest-option--active {
  background-color: var(--color-row-hover);
}
</style>
