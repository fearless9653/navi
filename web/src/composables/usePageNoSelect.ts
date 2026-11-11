import { onUnmounted, watch } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';

/** 首页与后台设置中心路由时挂在 `body` 上的开关类，对应 `style.css` 里的整页禁选规则。 */
export const PAGE_NO_SELECT_CLASS = 'page-no-select';

/**
 * 需要关闭整页划选的路由：首页，以及后台设置中心全部子页（含尚无 name 的 `/settings` 父路径）。
 * 登录、首启、改密、404 不启用。
 */
export function isNoSelectRoute(
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path'>,
): boolean {
  const { name, path } = route;
  if (name === 'home') return true;
  if (typeof name === 'string' && name.startsWith('settings-')) return true;
  return path === '/settings' || path.startsWith('/settings/');
}

function hasDocument(): boolean {
  return typeof document !== 'undefined';
}

/**
 * 在首页与后台管理各页关闭整页划选 / Ctrl+A，输入框与可编辑区域除外。
 * 类加在 `body` 上，Teleport 到 body 的弹窗/下拉浮层会一并生效。
 * 不要再在各页子组件上单独写 `user-select: none`，也不要在此拦截 pointerdown 或清空 selection。
 */
export function usePageNoSelect(): void {
  const route = useRoute();

  function sync(): void {
    if (!hasDocument()) return;
    document.body.classList.toggle(PAGE_NO_SELECT_CLASS, isNoSelectRoute(route));
  }

  watch(() => [route.name, route.path] as const, sync, { immediate: true });
  onUnmounted(() => {
    if (!hasDocument()) return;
    document.body.classList.remove(PAGE_NO_SELECT_CLASS);
  });
}
