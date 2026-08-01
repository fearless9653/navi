import { computed, ref, type Ref } from 'vue';
import { useResizeMeasure } from './useResizeMeasure';

const CARD_HEIGHT = 112; // 卡片固定高 h-28（两浏览器一致，可信任）
const GAP = 16; // 桌面网格 sm:gap-4
// 网格下端到视口底部的预留高度：分页器(~46) + 主容器底部 padding(py-3=12) + 16。
// 末尾的 16 是 section gap-4 的基础间距；余数均摊时上下边缘（网格 padding-block）
// 与行距同步增长，故「末行 ↔ 分页器」「分隔线 ↔ 首行」实际间距 = 16 + 均摊量 = 行距。
// 用「实测网格上端 + 该常量」替代旧的 OVERHEAD 猜测，跨浏览器差异由实测 top 吸收；
// 无独立安全余白——均摊量用 floor 取整保证内容绝不超出 available（见 calcGridLayout）。
const RESERVE_BELOW = 74;

const MOBILE_PAGE_SIZE = 12; // 手机固定值：对 2/3 列均整除，末行必满；允许滚动。
// 桌面上限（防超大屏一页过多）。导出供 BookmarkGrid 骨架屏兜底复用，保持同源不脱节。
export const MAX_PAGE_SIZE = 72;

// 桌面卡片最小宽度：列数由网格容器实测宽度反解（floor((width+GAP)/(CARD_MIN_WIDTH+GAP))，
// 钳制 MIN_COLS~MAX_COLS），保证卡片宽 ≥ 该值、标题不过度截断。
// 刻意不按视口宽分档：侧栏在 lg/xl/2xl 吃掉 15/18/20rem，主容器另有 max-w 封顶，
// 视口分档会在窄网格里塞入过多列（如 1920 视口下网格实测宽却排过多列）。
const CARD_MIN_WIDTH = 190;
const MIN_COLS = 4; // 桌面下限：与「≥1024 即桌面」语义一致（手机为 2/3 列）。
const MAX_COLS = 8; // 桌面上限：超宽网格下卡片过多反而难扫视。

/**
 * 类「手机」布局判据（本文件内唯一真源）：视口宽 < 1024。
 *
 * 此判据当前与另外三处严格对应，四者锚定同一个 1024px：
 *   1. 本判据：< 1024 走固定 MOBILE_PAGE_SIZE、静态 2/3 列、允许滚动；
 *   2. BookmarkGrid.vue 的静态列类 `grid-cols-2 md:grid-cols-3`：手机列数（768 分档）；
 *   3. HomeView.vue 的 `lg:grid-cols-[...]`：< 1024px 时侧栏排在网址列表上方；
 *   4. BookmarkGrid.vue 的 `@media (min-width: 1024px)`：仅桌面消费 --bm-cols 动态列数
 *      与 --bm-row-gap 动态行距。
 *
 * ⚠️ 第 2、3、4 点是 Tailwind 工具类 / CSS 媒体查询，构建期编译成静态 CSS，JS 无法引用，
 * 只能靠约定同步。改动断点或 aside 的显示断点时，务必同步这三处。
 */
const MOBILE_BREAKPOINT = 1024;

/** 桌面列数：由网格容器实测宽度反解（N 列占 N×CARD_MIN + (N-1)×GAP，反解时 +GAP 再除）。 */
function getDesktopColumns(gridWidth: number): number {
  const raw = Math.floor((gridWidth + GAP) / (CARD_MIN_WIDTH + GAP));
  return Math.min(Math.max(raw, MIN_COLS), MAX_COLS);
}

/**
 * 桌面（视口 ≥ 1024）：cols 由网格实测宽度反解；size = cols × rows，rows 由实测网格
 * 上端算得，绝不滚动；行数反解的 floor 余数均摊到 rows+1 个槽位：rows−1 个行距 +
 * 上下两个边缘（网格 padding-block，见 BookmarkGrid 的 calc），令「分隔线 ↔ 首行」
 * 「行 ↔ 行」「末行 ↔ 分页器」共享同一间距、同一节奏，余数不再沉积为不定高空白。
 * 行距对整个页容量恒定：末页不满时沿用同一行距与边缘、仅底部自然留白。
 * 手机（视口 < 1024）：返回固定值与固定行距，不走计算，允许滚动；cols 仅回显
 * 静态类的取值（<768 → 2，≥768 → 3），CSS 侧不消费。
 * size 恒为 cols 的整数倍 → 末行必满。
 * （导出仅为单测；运行时唯一调用方是 useResponsivePageSize。）
 */
export function calcGridLayout(
  gridTop: number,
  gridWidth: number,
): { size: number; rowGap: number; cols: number } {
  if (window.innerWidth < MOBILE_BREAKPOINT) {
    return { size: MOBILE_PAGE_SIZE, rowGap: GAP, cols: window.innerWidth >= 768 ? 3 : 2 };
  }

  const cols = getDesktopColumns(gridWidth);
  const available = window.innerHeight - gridTop - RESERVE_BELOW;
  // N 行占 N×CARD + (N-1)×GAP，反解时 +GAP 再除。
  const rawRows = Math.floor((available + GAP) / (CARD_HEIGHT + GAP));
  // 上限也按行钳制，保证 size 始终是 cols 的整数倍（避免固定 72 在非整除列数下缺末行）。
  const maxRows = Math.max(1, Math.floor(MAX_PAGE_SIZE / cols));
  const rows = Math.min(Math.max(rawRows, 1), maxRows); // 下限 1 行（= cols 个，cols≥4）。
  // 余数均摊到 rows+1 个槽位（含上下边缘，单行也有两槽可摊）；封顶 2×GAP 防行数少、
  // 余数大时（含 maxRows 钳制）过度稀疏；视口矮于一行时余数为负，故 clamp。
  // floor 而非 round：向下取整令网格总高恒 ≤ available，绝不撑出滚动条
  //（RESERVE_BELOW 已无独立安全余白）；舍掉的零点几像素沉积在底部，肉眼不可辨。
  const leftover = Math.max(0, available - (rows * CARD_HEIGHT + (rows - 1) * GAP));
  const extra = Math.floor(Math.min(leftover / (rows + 1), 2 * GAP));
  return { size: cols * rows, rowGap: GAP + extra, cols };
}

/**
 * 首页网址网格每页数量、动态列数与动态行距：桌面列数按网格实测宽度反解、行数按
 * 实测高度反解铺满且不滚动，手机用固定值。
 * cols / rowGap 经 HomeView 以 --bm-cols / --bm-row-gap 变量下发给 BookmarkGrid
 *（仅 ≥1024px 消费）。
 * 无反馈回路：网格容器是 grid 1fr 列 + flex-1 撑开，宽高随视口与侧栏断点变化、
 * 不随内容，改列数/行距不会触发重算。
 * @param gridEl 网格容器（HomeView 的 flex-1 div）ref，用于实测其上端坐标与宽度。
 */
export function useResponsivePageSize(gridEl: Ref<HTMLElement | null>) {
  const pageSize = ref(MOBILE_PAGE_SIZE);
  const rowGap = ref(GAP);
  const cols = ref(MIN_COLS);

  useResizeMeasure(() => {
    const el = gridEl.value;
    const rect = el ? el.getBoundingClientRect() : { top: 0, width: 0 };
    const layout = calcGridLayout(rect.top, rect.width);
    pageSize.value = layout.size;
    rowGap.value = layout.rowGap;
    cols.value = layout.cols;
  }, gridEl);

  return {
    pageSize: computed(() => pageSize.value),
    rowGap: computed(() => rowGap.value),
    cols: computed(() => cols.value),
  };
}
