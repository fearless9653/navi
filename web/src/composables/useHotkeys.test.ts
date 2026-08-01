import { describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { useHotkeys, type Hotkey } from './useHotkeys';

/** 挂一个空组件承载 composable，返回 wrapper 以便卸载。 */
function mountHotkeys(hotkeys: Hotkey[]) {
  const Host = defineComponent({
    setup() {
      useHotkeys(hotkeys);
      return () => null;
    },
  });
  return mount(Host);
}

function press(key: string, init: KeyboardEventInit & { isComposing?: boolean } = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
  document.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('useHotkeys', () => {
  it('fires a single-key hotkey and prevents default', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'n', handler }]);

    const prevented = press('n');

    expect(handler).toHaveBeenCalledOnce();
    expect(prevented).toBe(true);
    wrapper.unmount();
  });

  it('matches letters case-insensitively (CapsLock) but not Shift combos', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'n', handler }]);

    press('N'); // CapsLock：无 shiftKey，大写 key
    expect(handler).toHaveBeenCalledOnce();

    press('N', { shiftKey: true }); // Shift+N：不触发
    expect(handler).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('ignores single-key hotkeys while typing in editable controls', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: '/', handler }]);
    const input = document.createElement('input');
    document.body.appendChild(input);

    const e = new KeyboardEvent('keydown', { key: '/', cancelable: true, bubbles: true });
    input.dispatchEvent(e);

    expect(handler).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    input.remove();
    wrapper.unmount();
  });

  it('ignores events during IME composition and key repeat', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'n', handler }]);

    press('n', { isComposing: true });
    press('n', { repeat: true });

    expect(handler).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('fires repeated keydowns for allowRepeat hotkeys (长按连动)', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'ArrowDown', allowRepeat: true, handler }]);

    press('ArrowDown'); // 首次
    press('ArrowDown', { repeat: true }); // 长按重复
    press('ArrowDown', { repeat: true });

    expect(handler).toHaveBeenCalledTimes(3);

    // allowRepeat 不豁免 IME：组合中仍不触发
    press('ArrowDown', { repeat: true, isComposing: true });
    expect(handler).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('throttles repeated keydowns to repeatIntervalMs (长按连动限速)', () => {
    // timeStamp 无法经 init 设置，用 defineProperty 覆盖以精确控制节流窗口。
    function pressAt(key: string, timeStamp: number, init: KeyboardEventInit = {}): boolean {
      const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
      Object.defineProperty(e, 'timeStamp', { value: timeStamp });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    }

    const handler = vi.fn();
    const wrapper = mountHotkeys([
      { key: 'ArrowDown', allowRepeat: true, repeatIntervalMs: 100, handler },
    ]);

    expect(pressAt('ArrowDown', 0)).toBe(true); // 首次按下：立即放行
    expect(handler).toHaveBeenCalledTimes(1);

    // 距上次触发不足 100ms：吞掉，但仍 preventDefault（不让页面滚动）。
    expect(pressAt('ArrowDown', 50, { repeat: true })).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    // 超过间隔：放行。
    pressAt('ArrowDown', 150, { repeat: true });
    expect(handler).toHaveBeenCalledTimes(2);

    // 再次落入窗口内：吞掉。
    pressAt('ArrowDown', 180, { repeat: true });
    expect(handler).toHaveBeenCalledTimes(2);

    // 再次越过间隔：放行。
    pressAt('ArrowDown', 260, { repeat: true });
    expect(handler).toHaveBeenCalledTimes(3);

    wrapper.unmount();
  });

  it('ignores single keys with Ctrl/Meta/Alt held', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'n', handler }]);

    press('n', { ctrlKey: true });
    press('n', { metaKey: true });
    press('n', { altKey: true });

    expect(handler).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('fires ctrlOrMeta hotkeys with either Ctrl or Meta, even inside inputs', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'k', ctrlOrMeta: true, allowInEditable: true, handler }]);
    const input = document.createElement('input');
    document.body.appendChild(input);

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true, bubbles: true }),
    );
    press('k', { metaKey: true });
    press('k'); // 无修饰键：不触发

    expect(handler).toHaveBeenCalledTimes(2);
    input.remove();
    wrapper.unmount();
  });

  it('skips a hotkey whose enabled() returns false without swallowing the event', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'n', enabled: () => false, handler }]);

    const prevented = press('n');

    expect(handler).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
    wrapper.unmount();
  });

  it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const wrapper = mountHotkeys([{ key: 'n', handler }]);
    wrapper.unmount();

    press('n');

    expect(handler).not.toHaveBeenCalled();
  });
});
