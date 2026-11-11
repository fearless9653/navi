import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import TagCascadePopover from './TagCascadePopover.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function mountPopover() {
  return mount(TagCascadePopover, {
    props: { modelValue: [] },
    global: {
      stubs: { TagCascadePicker: true, BaseChevron: true },
    },
  });
}

describe('TagCascadePopover Esc 处理', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('打开时按 Esc 只关弹层，并阻止事件传播到外层（不连带关闭 BaseModal）', async () => {
    // 模拟外层 BaseModal 在 document 上的 Esc 监听（冒泡阶段）。
    const outerEsc = vi.fn();
    document.addEventListener('keydown', outerEsc);

    const wrapper = mountPopover();
    await wrapper.find('button').trigger('click'); // 打开
    await nextTick();
    expect(document.body.querySelector('.ui-surface')).not.toBeNull(); // 弹层已 teleport 到 body

    // 在 body 内派发 Escape：capture 阶段 window 上的监听先执行并 stopImmediatePropagation。
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await nextTick();

    expect(document.body.querySelector('.ui-surface')).toBeNull(); // 弹层已关
    expect(outerEsc).not.toHaveBeenCalled(); // 外层未收到 Esc

    document.removeEventListener('keydown', outerEsc);
    wrapper.unmount();
  });

  it('浮层内部滚动（出现滚动条）不关闭弹层', async () => {
    const wrapper = mountPopover();
    await wrapper.find('button').trigger('click'); // 打开
    await nextTick();
    const panel = document.body.querySelector('.ui-surface');
    expect(panel).not.toBeNull();

    // 滚轮在浮层内滚动 → scroll 事件 target 在弹层内部，不应关闭。
    panel!.dispatchEvent(new Event('scroll', { bubbles: true }));
    await nextTick();

    expect(document.body.querySelector('.ui-surface')).not.toBeNull(); // 弹层仍在

    wrapper.unmount();
  });

  it('外部滚动（页面级）仍关闭弹层', async () => {
    const wrapper = mountPopover();
    await wrapper.find('button').trigger('click'); // 打开
    await nextTick();
    expect(document.body.querySelector('.ui-surface')).not.toBeNull();

    // 页面级滚动 → target 不在弹层内部，应关闭。
    window.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(document.body.querySelector('.ui-surface')).toBeNull(); // 弹层已关

    wrapper.unmount();
  });

  it('关闭状态下 Esc 不拦截（放行给外层）', async () => {
    const outerEsc = vi.fn();
    document.addEventListener('keydown', outerEsc);

    const wrapper = mountPopover(); // 默认关闭
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await nextTick();

    expect(outerEsc).toHaveBeenCalledTimes(1); // 未被拦截

    document.removeEventListener('keydown', outerEsc);
    wrapper.unmount();
  });
});

describe('TagCascadePopover 关闭与滚动容器', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('点击浮层外的遮罩关闭弹层', async () => {
    const wrapper = mountPopover();
    await wrapper.find('button').trigger('click');
    await nextTick();

    const overlay = document.body.querySelector('[data-test="tag-popover-overlay"]');
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).style.zIndex).toBe('var(--z-popover)');

    overlay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(document.body.querySelector('[data-test="tag-popover-panel"]')).toBeNull();
    wrapper.unmount();
  });

  it('面板本身不出现外框纵向滚动条（overflow hidden）', async () => {
    const wrapper = mountPopover();
    await wrapper.find('button').trigger('click');
    await nextTick();

    const panel = document.body.querySelector('[data-test="tag-popover-panel"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('overflow-hidden')).toBe(true);
    expect(panel.classList.contains('overflow-y-auto')).toBe(false);

    wrapper.unmount();
  });
});
