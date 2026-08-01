import { computed, ref } from 'vue';
import { useResizeMeasure } from './useResizeMeasure';

const ROW_HEIGHT = 44;
const OVERHEAD = 400;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

/**
 * 管理页表格每页行数：按视口高度反解（扣去表头/工具条/分页器等固定占用 OVERHEAD 后按行高分行）。
 * 表格自身可滚动，故无需 ResizeObserver 观测容器，仅随 window 尺寸变化重算。
 * （导出仅为单测；运行时唯一调用方是 useResponsiveTablePageSize。）
 */
export function calcTablePageSize(): number {
  const availableHeight = window.innerHeight - OVERHEAD;
  const rows = Math.max(Math.floor(availableHeight / ROW_HEIGHT) - 1, 1);
  return Math.min(Math.max(rows, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
}

export function useResponsiveTablePageSize() {
  const pageSize = ref(MIN_PAGE_SIZE);
  useResizeMeasure(() => {
    pageSize.value = calcTablePageSize();
  });
  return { pageSize: computed(() => pageSize.value) };
}
