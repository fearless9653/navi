import { reactive } from 'vue';

/** Toast 通知（docs/design-system/03 §通知微交互）。 */
export type ToastVariant = 'success' | 'danger' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const toasts = reactive<Toast[]>([]);
let seq = 0;

/** 弹出一条通知，duration 毫秒后自动消失（默认 3000）。 */
function push(message: string, variant: ToastVariant = 'info', duration = 3000): number {
  const id = ++seq;
  toasts.push({ id, message, variant });
  if (duration > 0) {
    setTimeout(() => remove(id), duration);
  }
  return id;
}

function remove(id: number): void {
  const i = toasts.findIndex((x) => x.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

export function useToast() {
  return {
    toasts,
    remove,
    push,
    success: (m: string, d?: number) => push(m, 'success', d),
    danger: (m: string, d?: number) => push(m, 'danger', d),
    warning: (m: string, d?: number) => push(m, 'warning', d),
    info: (m: string, d?: number) => push(m, 'info', d),
  };
}
