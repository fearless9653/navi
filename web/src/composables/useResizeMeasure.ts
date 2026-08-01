import { onMounted, onUnmounted, watch, type Ref } from 'vue';

/**
 * 「随视口/容器尺寸变化而重算测量」的副作用编织（三个 useResponsive* 复用）：
 * 挂载即测一次 + window.resize（200ms 防抖）+ 可选 ResizeObserver 观测容器 +
 * 容器 ref 变化时重观测并重测 + 卸载清理。调用方只需提供 measure 公式（及可选容器 ref）。
 *
 * @param measure 重算回调：读 window / 容器 rect 后写入调用方自己的 ref。
 * @param el 可选：用 ResizeObserver 观测的容器 ref；不传则仅监听 window.resize。
 */
export function useResizeMeasure(measure: () => void, el?: Ref<HTMLElement | null>): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ro: ResizeObserver | undefined;

  function onResize(): void {
    clearTimeout(timer);
    timer = setTimeout(measure, 200);
  }

  function observe(node: HTMLElement | null): void {
    ro?.disconnect();
    if (node && ro) ro.observe(node);
  }

  onMounted(() => {
    // 容器高/宽随内容与断点变化，用 ResizeObserver 监听最准；jsdom 等无该 API 的环境降级为仅 window.resize。
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => onResize());
    }
    measure();
    if (el) observe(el.value);
    window.addEventListener('resize', onResize);
  });

  // 容器 ref 挂载/替换后重新观测并测量。
  if (el) {
    watch(el, (node) => {
      observe(node);
      measure();
    });
  }

  onUnmounted(() => {
    clearTimeout(timer);
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
  });
}
