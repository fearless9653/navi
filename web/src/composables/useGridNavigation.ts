import type { Ref } from 'vue';

/** 方向键移动的四个方向。 */
export type GridDirection = 'up' | 'down' | 'left' | 'right';

/**
 * 网址卡片网格的键盘方向导航。
 *
 * 卡片本身已是原生 <button>（BaseCard interactive），焦点 / Enter 跳转 / focus-visible
 * 高亮全部由浏览器提供。本 composable 只负责「把焦点送到第一个卡片」与「按方向键在卡片间搬焦点」，
 * 不引入任何自维护的选中态。
 *
 * 列数随断点响应式变化（grid-cols-2 → 4xl:grid-cols-8），因此上下移动的跨度不能写死，
 * 需实时读取网格元素的 grid-template-columns 计算当前列数。
 */
export function useGridNavigation(gridContainer: Ref<HTMLElement | null>) {
  /** 取网格内所有卡片按钮（顺序即 DOM 顺序，与 bm.items 一致）。 */
  function cards(): HTMLElement[] {
    const root = gridContainer.value;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('[data-bm-card]'));
  }

  /** 真正带 grid 布局的元素（TransitionGroup 渲染的 [data-bm-grid]）。 */
  function gridEl(): HTMLElement | null {
    return gridContainer.value?.querySelector<HTMLElement>('[data-bm-grid]') ?? null;
  }

  /** 读 grid-template-columns 计算列数；读不到时退化为 1（等价纯上下线性移动）。 */
  function columnCount(): number {
    const el = gridEl();
    if (!el) return 1;
    const tpl = getComputedStyle(el).gridTemplateColumns;
    if (!tpl || tpl === 'none') return 1;
    const n = tpl.trim().split(/\s+/).length;
    return n > 0 ? n : 1;
  }

  /** 当前聚焦的卡片在网格中的下标；焦点不在任何卡片上时返回 -1。 */
  function activeIndex(list: HTMLElement[]): number {
    const active = document.activeElement;
    return active instanceof HTMLElement ? list.indexOf(active) : -1;
  }

  /** 焦点当前是否落在网格内的某个卡片上——方向键接管的前提。 */
  function isInGrid(): boolean {
    return activeIndex(cards()) !== -1;
  }

  /** 聚焦第一个卡片（入口键 g）。无卡片时静默返回。 */
  function focusFirst(): void {
    cards()[0]?.focus();
  }

  /** 退出网格导航（Esc）：让当前聚焦的卡片失焦，与其余快捷键的 Esc 失焦语义一致。 */
  function blur(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && isInGrid()) active.blur();
  }

  /** 按方向移动焦点；越界则 clamp（停在边界，不翻页、不回绕）。 */
  function move(dir: GridDirection): void {
    const list = cards();
    if (!list.length) return;
    const current = activeIndex(list);
    if (current === -1) return; // 焦点不在网格内，交由 isInGrid 守卫拦截，这里再兜底

    const cols = columnCount();
    let target = current;
    switch (dir) {
      case 'left':
        target = current - 1;
        break;
      case 'right':
        target = current + 1;
        break;
      case 'up':
        target = current - cols;
        break;
      case 'down':
        target = current + cols;
        break;
    }
    if (target < 0 || target >= list.length) return; // clamp：越界不动
    list[target]?.focus();
  }

  return { focusFirst, move, blur, isInGrid, columnCount };
}
