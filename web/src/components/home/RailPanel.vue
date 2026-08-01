<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBookmarksStore } from '@/stores/bookmarks';
import { Favicon } from '@/components/atoms';
import type { RecentBookmark } from '@/api/types';

/**
 * 首页侧栏单个面板（最近访问 / 访问次数 / 自设权重 / 创建时间共用）。
 * 仅 clearable（最近访问）渲染清空按钮与行内 ✕；其余榜单只读，这是刻意的产品决策。
 * collapsed 全尺寸生效：未选中的面板整卡隐藏（HomeRails 做单开切换，永远恰好一个展开）；
 * 展开的面板 flex-1 撑满侧栏可用高、列表自身滚动。
 */
const props = withDefaults(
  defineProps<{
    title: string;
    items: RecentBookmark[];
    clearable?: boolean;
    collapsed?: boolean;
  }>(),
  { clearable: false, collapsed: false },
);
const emit = defineEmits<{ clear: []; remove: [id: number] }>();

const { t } = useI18n();
const bm = useBookmarksStore();

const isTouch = matchMedia('(pointer: coarse)').matches;
const activeId = ref<number | null>(null);

function handleClick(b: RecentBookmark): void {
  // 触屏两段式仅对 clearable 面板有意义：第一击高亮以露出 ✕，第二击才打开。
  if (props.clearable && isTouch && activeId.value !== b.id) {
    activeId.value = b.id;
    return;
  }
  activeId.value = null;
  void bm.visit(b.id);
  window.open(b.url, '_blank', 'noopener');
}
</script>

<template>
  <!-- 单开：未选中 → 整卡隐藏；选中 → min-h-0 flex-1 吃满分段条以下的全部侧栏高，
       内部列表（ul）再自身滚动。overflow-hidden 兜住圆角与超高内容。 -->
  <section
    class="rail-panel ui-surface-translucent flex flex-col overflow-hidden rounded-2xl p-4"
    :class="collapsed ? 'hidden' : 'rail-panel-in min-h-0 flex-1'"
  >
    <header class="flex items-center justify-between">
      <h2 class="text-sm font-medium ui-text-subtle">{{ title }}</h2>
      <button
        v-if="clearable && items.length"
        class="rounded px-1.5 py-0.5 text-xs ui-text-faint transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] hover:text-[var(--color-danger)]"
        @click="emit('clear')"
      >
        {{ t('common.clear') }}
      </button>
    </header>
    <!-- 列表 flex-1 填充面板剩余高、超出自身滚动（单开面板高，条数由视口反解一般填得满）。 -->
    <ul class="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
      <li
        v-for="(b, i) in items"
        :key="b.id"
        class="rail-row group/item flex items-center rounded ui-row-hover"
        :class="{ 'bg-[var(--color-row-hover)]': activeId === b.id }"
        :style="{ '--i': Math.min(i, 12) }"
      >
        <button
          class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-sm"
          @click="handleClick(b)"
        >
          <Favicon :src="b.faviconUrl" size="h-4 w-4" />
          <span class="truncate">{{ b.name }}</span>
        </button>
        <button
          v-if="clearable"
          class="mr-1 shrink-0 rounded px-1.5 py-0.5 text-xs ui-status-danger opacity-0 transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] group-hover/item:opacity-100 focus:opacity-100"
          :class="{ '!opacity-100': activeId === b.id }"
          :title="t('home.removeOne')"
          :aria-label="t('home.removeOne')"
          @click="
            emit('remove', b.id);
            activeId = null;
          "
        >
          ✕
        </button>
      </li>
      <li v-if="!items.length" class="px-2 py-1 text-xs ui-text-faint">
        {{ t('common.empty') }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.rail-panel {
  /* 与搜索框 / 音乐播放器同级的重玻璃：模糊加档把背后壁纸化开，叠加边缘折射
     （上沿亮线 + 下沿收边）补出方向感与厚度，再叠离地阴影抬离背景。
     仅覆盖 --glass-blur；saturate / 棱光 / 半透明配方继承自 ui-surface-translucent。 */
  --glass-blur: var(--glass-blur-strong);
  box-shadow: var(--glass-edge-light), var(--glass-edge-dark), var(--shadow-md);
}

/* 进场动效：HomeRails 单开切换靠 hidden（display:none）显隐，display 恢复时
   CSS 动画会重新播放——因此不需要 Vue Transition，动画类挂在展开态即可。
   面板整卡淡入 + 8px 上移；列表行按 25ms stagger 渐入（--i 由模板下发，上限 12，
   与 BookmarkGrid 的书签渐入同参数、同语言）。 */
.rail-panel-in {
  animation: rail-panel-in var(--duration-base) var(--ease-out) both;
}
.rail-panel-in .rail-row {
  animation: rail-row-in var(--duration-base) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 25ms);
}
@keyframes rail-panel-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@keyframes rail-row-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

/* 全局 reduced-motion 只压缩时长、盖不到 animation-delay（fill:both 会让行在
   延迟期整段隐身），故显式关闭（BookmarkGrid 同款处理）。 */
@media (prefers-reduced-motion: reduce) {
  .rail-panel-in,
  .rail-panel-in .rail-row {
    animation: none;
  }
}
</style>
