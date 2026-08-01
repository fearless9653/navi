import { computed, ref, type Ref } from 'vue';
import { useResizeMeasure } from './useResizeMeasure';

// 侧栏「分段条 + 单开面板」（HomeRails）：下方只展示一个面板、撑满分段条以下的全部侧栏高，
// 需反解这一个面板的条数。
const ROW_HEIGHT = 28; // 单行内容高：py-1(8) + text-sm 行高(~20)。
const ROW_GAP = 2; // 行间距 space-y-0.5。
const SEG_BAR_HEIGHT = 40; // 分段条高：按钮 py-2(16)+text-xs 行高(~16) + 外层 p-1(8)。
const CONTAINER_GAP = 12; // 分段条与面板之间的 gap-3。
// RailPanel 内「面板顶 → 列表 <ul> 顶」的固定占用：p-4 上边(16) + header h2(~20) + ul mt-2(8)。
const HEADER_OFFSET = 44;
const PAD_BOTTOM = 16; // RailPanel 的 p-4 下边。
// 侧栏下端到视口底部的预留：主容器底部 padding(py-3=12) + 亚像素安全余白。
// 侧栏与网址列表同格拉伸，底缘对齐分页器下缘，故只需扣主容器 padding。
const RESERVE_BELOW = 16;

const MOBILE_BREAKPOINT = 1024; // 与 HomeView 的 lg: 断点锚定一致（<1024 侧栏堆叠在网址列表上方）。
const MOBILE_COUNT = 8; // 宽 < 1024 时侧栏堆叠、允许滚动，8 条与旧版最近访问持平。
const MIN_COUNT = 3; // 桌面下限：矮窗口也至少 3 条（RailPanel + ul overflow 兜底）。
const MAX_COUNT = 50; // 桌面上限：须 ≤ 后端 /top（Math.min(q,50)）与 recentCount 的 max(50)，两端同源。

/**
 * 桌面（宽 ≥ 1024）：由实测侧栏上端反解「单个面板」的条数——
 * 可用高扣去分段条、分段条↔面板 gap、面板头部与下边 padding，剩余列表高按行高反解。
 * 移动（宽 < 1024）：返回固定值，允许滚动。
 * 四个面板共用同一条数（同时只展示一个），条数亦作为 /recent 与 /top 的 limit。
 * （导出仅为单测；运行时唯一调用方是 useResponsivePanelCount。）
 * @param asideTop 侧栏 aside 的 getBoundingClientRect().top 实测值。
 */
export function calcPanelCount(asideTop: number): number {
  if (window.innerWidth < MOBILE_BREAKPOINT) return MOBILE_COUNT;

  const available = window.innerHeight - asideTop - RESERVE_BELOW;
  const listHeight = available - SEG_BAR_HEIGHT - CONTAINER_GAP - HEADER_OFFSET - PAD_BOTTOM;
  // N 行占 N×ROW_HEIGHT + (N-1)×ROW_GAP，反解时 +ROW_GAP 再除。
  const rawRows = Math.floor((listHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP));
  return Math.min(Math.max(rawRows, MIN_COUNT), MAX_COUNT);
}

/**
 * 首页侧栏单开面板的条数：桌面按实测高度让选中面板铺满侧栏且不整体滚动（列表自身滚动），
 * 移动端用固定值。无反馈回路：条数只依赖视口与 aside 上端，不依赖面板内容。
 * @param asideEl 侧栏容器（HomeView 的 <aside>）ref，用于实测其上端坐标。
 */
export function useResponsivePanelCount(asideEl: Ref<HTMLElement | null>) {
  const panelCount = ref(MOBILE_COUNT);

  useResizeMeasure(() => {
    const el = asideEl.value;
    const top = el ? el.getBoundingClientRect().top : 0;
    panelCount.value = calcPanelCount(top);
  }, asideEl);

  return { panelCount: computed(() => panelCount.value) };
}
