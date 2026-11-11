import { describe, expect, it, vi } from 'vitest';
import { useBackdropDismiss } from './useBackdropDismiss';

function targetEvent(type: 'pointerdown' | 'pointerup', target: EventTarget, currentTarget: EventTarget): PointerEvent {
  const ev = new PointerEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'target', { value: target });
  Object.defineProperty(ev, 'currentTarget', { value: currentTarget });
  return ev;
}

describe('useBackdropDismiss', () => {
  it('按下和松开都在遮罩上时才关闭', () => {
    const dismiss = vi.fn();
    const { onBackdropPointerDown, onBackdropPointerUp } = useBackdropDismiss(dismiss);
    const backdrop = document.createElement('div');

    onBackdropPointerDown(targetEvent('pointerdown', backdrop, backdrop));
    onBackdropPointerUp(targetEvent('pointerup', backdrop, backdrop));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('在内容区按下、在遮罩上松开时不关闭', () => {
    const dismiss = vi.fn();
    const { onBackdropPointerDown, onBackdropPointerUp } = useBackdropDismiss(dismiss);
    const backdrop = document.createElement('div');
    const field = document.createElement('input');

    onBackdropPointerDown(targetEvent('pointerdown', field, backdrop));
    onBackdropPointerUp(targetEvent('pointerup', backdrop, backdrop));

    expect(dismiss).not.toHaveBeenCalled();
  });

  it('在遮罩上按下、在内容区松开时不关闭', () => {
    const dismiss = vi.fn();
    const { onBackdropPointerDown, onBackdropPointerUp } = useBackdropDismiss(dismiss);
    const backdrop = document.createElement('div');
    const panel = document.createElement('div');

    onBackdropPointerDown(targetEvent('pointerdown', backdrop, backdrop));
    onBackdropPointerUp(targetEvent('pointerup', panel, backdrop));

    expect(dismiss).not.toHaveBeenCalled();
  });
});
