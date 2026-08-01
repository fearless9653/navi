<script lang="ts">
/** 侧栏面板 / 分段键：最近访问 | 访问次数 | 自设权重 | 创建时间。供父级持有选中态。 */
export type RailKey = 'recent' | 'visits' | 'weight' | 'created';
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBookmarksStore } from '@/stores/bookmarks';
import RailPanel from './RailPanel.vue';

/**
 * 首页侧栏「玻璃分段条 + 单开面板」：最近访问 | 访问次数 / 自设权重 | 创建时间四榜单，
 * 上方一行等分四段做切换、下方只展示选中的那一个面板（撑满侧栏可用高）。
 * 全尺寸统一：永远恰好一个面板展开（默认最近访问），点当前选中段无效——无「全收起」空态。
 * 受控组件：选中态由父级（HomeView）持有（v-model:selected），父级据此**懒加载**——
 * 只拉当前面板的数据，避免进页就把四榜单全拉一遍。选中项仅会话内，不持久化。
 * 桌面（≥1024px）侧栏为左列（宽由 HomeView 的 lg: 列宽控制）；手机（<1024px）坍缩为
 * 网址列表上方的堆叠块、允许滚动。断点与 useResponsivePanelCount 的 1024 判据锚定同一处。
 */
const props = defineProps<{ selected: RailKey }>();
const emit = defineEmits<{ 'update:selected': [RailKey] }>();

const { t } = useI18n();
const bm = useBookmarksStore();

// label：分段条短标签（防窄列换行）；full：悬浮 title/无障碍用的全称（= 面板标题）。
const SEGMENTS: { key: RailKey; label: string; full: string }[] = [
  { key: 'recent', label: 'home.segRecent', full: 'home.recent' },
  { key: 'visits', label: 'home.segVisits', full: 'home.byVisits' },
  { key: 'weight', label: 'home.segWeight', full: 'home.byWeight' },
  { key: 'created', label: 'home.segCreated', full: 'home.byCreated' },
];

// 点当前选中段无效：仅在切到不同面板时通知父级（避免多余事件与重复拉取）。
function select(key: RailKey): void {
  if (key !== props.selected) emit('update:selected', key);
}

// 选中段序号：驱动分段条滑动药丸的 translateX（见下方 .rails-seg-pill）。
const selectedIndex = computed(() => SEGMENTS.findIndex((s) => s.key === props.selected));
</script>

<template>
  <!-- 分段条 + 单开面板：容器撑满侧栏高，选中面板 flex-1 吃掉分段条以下的全部高度。 -->
  <div class="flex h-full flex-col gap-3">
    <!-- 玻璃分段条：一行等分四段，选中段由滑动药丸高亮（accent 底），文字色随选中过渡。 -->
    <div
      class="rails-seg ui-surface-translucent relative grid grid-cols-4 gap-1 rounded-2xl p-1"
      :style="{ '--seg-i': selectedIndex }"
    >
      <!-- 滑动药丸：唯一的高亮底块，切换时从旧段滑到新段（纯装饰，选中态语义在按钮 aria 上）。 -->
      <span class="rails-seg-pill" aria-hidden="true"></span>
      <button
        v-for="s in SEGMENTS"
        :key="s.key"
        class="relative truncate whitespace-nowrap rounded-xl px-1 py-2 text-xs font-medium transition-[color,background-color,transform] active:scale-95"
        :class="selected === s.key ? 'text-[var(--color-accent)]' : 'ui-text-muted ui-row-hover'"
        :title="t(s.full)"
        :aria-label="t(s.full)"
        :aria-selected="selected === s.key"
        :data-test="`rails-seg-${s.key}`"
        @click="select(s.key)"
      >
        {{ t(s.label) }}
      </button>
    </div>

    <RailPanel
      :title="t('home.recent')"
      :items="bm.recent"
      clearable
      :collapsed="selected !== 'recent'"
      @clear="bm.clearRecent()"
      @remove="bm.clearRecentOne($event)"
    />
    <RailPanel
      :title="t('home.byVisits')"
      :items="bm.tops.visits"
      :collapsed="selected !== 'visits'"
    />
    <RailPanel
      :title="t('home.byWeight')"
      :items="bm.tops.weight"
      :collapsed="selected !== 'weight'"
    />
    <RailPanel
      :title="t('home.byCreated')"
      :items="bm.tops.created"
      :collapsed="selected !== 'created'"
    />
  </div>
</template>

<style scoped>
.rails-seg {
  /* 与 RailPanel 同族的重玻璃与边缘折射，视觉上是同一组件家族的"把手"。 */
  --glass-blur: var(--glass-blur-strong);
  box-shadow: var(--glass-edge-light), var(--glass-edge-dark), var(--shadow-md);
}

.rails-seg-pill {
  /* 尺寸按容器 p-1（0.25rem×2）与 gap-1（0.25rem×3）反解出单列宽；
     translateX 的百分比相对药丸自身宽（= 列宽），故步进 = 100% + 一个 gap。
     改分段数 / padding / gap 时此处三个常量需同步。 */
  position: absolute;
  top: 0.25rem;
  bottom: 0.25rem;
  left: 0.25rem;
  width: calc((100% - 1.25rem) / 4);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  transform: translateX(calc(var(--seg-i, 0) * (100% + 0.25rem)));
  transition: transform var(--duration-base) var(--ease-out);
  pointer-events: none;
}
</style>
