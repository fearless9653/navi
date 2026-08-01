import { ref } from 'vue';

/**
 * 全局确认对话框（docs/design-system §模态框）。仿 useToast 的单例模式：
 * 模块级状态 + 在 App 根挂载一次的 ConfirmHost，避免每个调用点各自维护弹窗状态。
 * 用法：`if (!(await confirm({ message }))) return;` —— 取消/关闭均 resolve(false)。
 */
export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 确认按钮变体，删除类操作用 'danger'（默认）。 */
  variant?: 'primary' | 'danger';
}

export interface ConfirmState extends ConfirmOptions {
  id: number;
}

const current = ref<ConfirmState | null>(null);
let seq = 0;
let resolver: ((ok: boolean) => void) | null = null;

/** 打开确认弹窗；返回 Promise，确认 resolve(true)、取消/关闭 resolve(false)。 */
function confirm(options: ConfirmOptions): Promise<boolean> {
  // 已有弹窗未决时，先把它当作取消 resolve，避免 Promise 悬挂。
  resolver?.(false);
  current.value = { id: ++seq, variant: 'danger', ...options };
  return new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
}

function settle(ok: boolean): void {
  resolver?.(ok);
  resolver = null;
  current.value = null;
}

export function useConfirm() {
  return {
    current,
    confirm,
    accept: () => settle(true),
    cancel: () => settle(false),
  };
}
