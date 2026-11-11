import { onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';

/** 首页路由时挂在 `body` 上的开关类，对应 `style.css` 里的整页禁选规则。 */
export const HOME_NO_SELECT_CLASS = 'home-no-select';

/**
 * 仅在首页关闭整页划选 / Ctrl+A，输入框除外。
 * 不要再在首页子组件上单独写 `user-select: none`。
 */
export function useHomeNoSelect(): void {
  const route = useRoute();

  function sync(name: typeof route.name): void {
    document.body.classList.toggle(HOME_NO_SELECT_CLASS, name === 'home');
  }

  watch(() => route.name, sync, { immediate: true });
  onUnmounted(() => document.body.classList.remove(HOME_NO_SELECT_CLASS));
}
