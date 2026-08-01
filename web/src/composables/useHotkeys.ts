import { onMounted, onUnmounted } from 'vue';

/**
 * 单个快捷键绑定。
 * - 单键（如 'n'、'/'）默认在输入控件内不触发，避免打断打字；
 * - ctrlOrMeta 组合键（如 Ctrl/⌘+K）可用 allowInEditable 在输入框内也生效。
 */
export interface Hotkey {
  /** 与 KeyboardEvent.key 匹配：字母不区分大小写（兼容 CapsLock），其余精确匹配。 */
  key: string;
  /** 要求按住 Ctrl（Win/Linux）或 ⌘（macOS）。 */
  ctrlOrMeta?: boolean;
  /** 焦点位于 input/textarea/select/contenteditable 内时仍触发（默认不触发）。 */
  allowInEditable?: boolean;
  /** 长按时接受系统重复派发的 keydown（默认丢弃，避免动作型快捷键连触发）。方向键等连续移动场景开启。 */
  allowRepeat?: boolean;
  /**
   * 长按重复的最小触发间隔（毫秒）。设置后，首次按下立即触发，随后的系统重复事件
   * 按此间隔节流，使连动速度与操作系统键盘重复率解耦、跨平台一致。仅在 allowRepeat 时生效。
   */
  repeatIntervalMs?: number;
  /** 额外启用条件（如「无弹窗打开」「已登录」）；返回 false 则跳过。 */
  enabled?: () => boolean;
  handler: (e: KeyboardEvent) => void;
}

/** 焦点是否在可编辑控件内 —— 单键快捷键在此场景必须让位给正常输入。 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function keyMatches(hk: Hotkey, e: KeyboardEvent): boolean {
  // 字母键：不区分大小写（CapsLock 下 e.key 为大写），但排除 Shift 组合
  //（Shift+N 留给浏览器/其他用途；'?' 这类 shifted 字符由 e.key 精确体现，不受此限）。
  if (/^[a-z]$/i.test(hk.key)) {
    return e.key.toLowerCase() === hk.key.toLowerCase() && !e.shiftKey;
  }
  return e.key === hk.key;
}

/**
 * 声明式全局快捷键注册（document 级 keydown），随组件挂载/卸载自动增删监听。
 *
 * 公共守卫（全部绑定生效）：
 * - IME 组合中（isComposing）不触发 —— 中文输入法场景关键；
 * - 长按重复（repeat）默认不触发；绑定声明 allowRepeat 时放行（方向键等连续移动）；
 * - 单键绑定要求无 Ctrl/⌘/Alt 修饰；ctrlOrMeta 绑定要求 Ctrl 或 ⌘ 且无 Alt
 *  （排除 AltGr 等产生字符的组合）。
 */
export function useHotkeys(hotkeys: Hotkey[]): void {
  // 每个绑定上次触发的时间戳，用于 repeatIntervalMs 节流（按绑定对象身份区分）。
  const lastFiredAt = new WeakMap<Hotkey, number>();

  function onKeydown(e: KeyboardEvent): void {
    if (e.isComposing) return; // IME 组合中永不触发
    for (const hk of hotkeys) {
      if (!keyMatches(hk, e)) continue;
      if (e.repeat && !hk.allowRepeat) continue; // 长按重复默认丢弃，方向键等显式放行
      if (hk.ctrlOrMeta) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) continue;
      } else if (e.ctrlKey || e.metaKey || e.altKey) {
        continue;
      }
      if (!hk.allowInEditable && isEditable(e.target)) continue;
      if (hk.enabled && !hk.enabled()) continue;
      // 长按连动节流：首次按下（非 repeat）立即放行；随后的系统重复事件按 repeatIntervalMs 限流，
      // 使移动速度与操作系统键盘重复率解耦、跨平台一致。放在所有守卫之后，仅节流本会触发的事件。
      if (e.repeat && hk.repeatIntervalMs) {
        const last = lastFiredAt.get(hk);
        if (last !== undefined && e.timeStamp - last < hk.repeatIntervalMs) {
          e.preventDefault(); // 吞掉这次重复，但不放行 handler
          return;
        }
      }
      lastFiredAt.set(hk, e.timeStamp);
      e.preventDefault();
      hk.handler(e);
      return;
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeydown));
  onUnmounted(() => document.removeEventListener('keydown', onKeydown));
}
