import { onBeforeUnmount, ref } from 'vue';

/**
 * 列表拖拽重排的通用状态机（Pointer Events，零依赖）。
 * 用 pointerdown/move/up 统一鼠标与触摸，移动端也能用（原生 HTML5 拖拽在触摸设备上不工作）。
 *
 * 用法：
 * - 每个列表行加 :data-drag-index="idx"，用于命中检测落点。
 * - 拖拽手柄绑 @pointerdown="onPointerDown(idx, $event)"，并加 touch-none（touch-action: none）阻止拖动时页面滚动。
 *
 * 「如何提交新顺序」由调用方在 onReorder(from, to) 里决定：
 * DB 列表可在回调里打重排接口，本地数组可直接 splice。
 */
export function useDragReorder(onReorder: (from: number, to: number) => void) {
  // dragIndex 被拖起的行，overIndex 当前悬停的落点行。
  const dragIndex = ref<number | null>(null);
  const overIndex = ref<number | null>(null);

  // 用手指/指针位置反查落点行：读最近祖先上的 data-drag-index。
  function findIndexAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest<HTMLElement>('[data-drag-index]');
    const raw = row?.dataset.dragIndex;
    return raw != null ? Number(raw) : null;
  }

  function onPointerMove(ev: PointerEvent): void {
    if (dragIndex.value === null) return;
    const to = findIndexAt(ev.clientX, ev.clientY);
    if (to !== null) overIndex.value = to;
  }

  function onPointerUp(): void {
    const from = dragIndex.value;
    const to = overIndex.value;
    cleanup();
    if (from === null || to === null || from === to) return;
    onReorder(from, to);
  }

  function cleanup(): void {
    dragIndex.value = null;
    overIndex.value = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerDown(index: number, ev: PointerEvent): void {
    if (ev.button !== 0) return; // 只响应主键/单指
    ev.preventDefault(); // 阻止文本选择与兼容性鼠标事件
    dragIndex.value = index;
    overIndex.value = index;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  onBeforeUnmount(cleanup);

  return { dragIndex, overIndex, onPointerDown };
}
