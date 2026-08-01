<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEnginesStore } from '@/stores/engines';
import EngineSelector from './EngineSelector.vue';

const { t } = useI18n();
const engines = useEnginesStore();
const q = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const focused = ref(false);

/** 输入是否已是网址：显式 http(s):// 或裸域名（含点、无空格，可带端口/路径）。 */
function looksLikeUrl(s: string): boolean {
  if (/^https?:\/\//i.test(s)) return true;
  return !/\s/.test(s) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s);
}

function submit(): void {
  const text = q.value.trim();
  if (!text) return;
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

/** Esc：清空并失焦，退回「页面级」快捷键状态（与 / 聚焦形成闭环）。 */
function onEscape(): void {
  q.value = '';
  inputRef.value?.blur();
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
  <form
    class="search-bar ui-surface-translucent w-full max-w-2xl md:max-w-3xl xl:max-w-[52rem]"
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
      aria-keyshortcuts="/ Control+K"
      class="ui-search min-w-0 flex-1 rounded-r-[2rem] bg-transparent px-4 py-3 text-base outline-none md:py-3.5 md:text-[1.0625rem]"
      @focus="focused = true"
      @blur="focused = false"
      @keydown.esc.prevent="onEscape"
    />
    <!-- 键位提示：未聚焦时展示，提示 / 可快速聚焦（GitHub 惯例） -->
    <kbd v-if="!focused" class="ui-kbd search-kbd" aria-hidden="true">/</kbd>
  </form>
</template>

<style scoped>
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
</style>
