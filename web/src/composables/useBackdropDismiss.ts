/**
 * 遮罩关闭：只有按下和松开都落在遮罩本身时才关闭。
 * 避免在弹层内框选文字时鼠标拖出边界，松开落在遮罩上被误判为关闭。
 */
export function useBackdropDismiss(dismiss: () => void): {
  onBackdropPointerDown: (e: PointerEvent) => void;
  onBackdropPointerUp: (e: PointerEvent) => void;
} {
  let pointerDownOnBackdrop = false;

  function onBackdropPointerDown(e: PointerEvent): void {
    pointerDownOnBackdrop = e.target === e.currentTarget;
  }

  function onBackdropPointerUp(e: PointerEvent): void {
    const shouldDismiss = pointerDownOnBackdrop && e.target === e.currentTarget;
    pointerDownOnBackdrop = false;
    if (shouldDismiss) dismiss();
  }

  return { onBackdropPointerDown, onBackdropPointerUp };
}
