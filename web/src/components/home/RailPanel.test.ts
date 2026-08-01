import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import RailPanel from './RailPanel.vue';
import type { RecentBookmark } from '@/api/types';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const ITEMS: RecentBookmark[] = [
  { id: 1, url: 'https://a.com', name: 'Alpha', faviconUrl: null },
  { id: 2, url: 'https://b.com', name: 'Beta', faviconUrl: null },
];

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(RailPanel, {
    props: { title: 'T', items: ITEMS, ...props },
    global: { stubs: { Favicon: { template: '<span />' } } },
  });
}

describe('RailPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // jsdom 无 matchMedia：打桩为非触屏。
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  });

  it('clearable：渲染清空按钮与行内 ✕，点击对外 emit', async () => {
    const wrapper = mountPanel({ clearable: true });

    const clear = wrapper.find('header button');
    expect(clear.text()).toBe('common.clear');
    await clear.trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);

    const removes = wrapper.findAll('[aria-label="home.removeOne"]');
    expect(removes).toHaveLength(2);
    await removes[1]!.trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[2]]);
  });

  it('默认只读：即使有条目也没有清空按钮和行内 ✕', () => {
    const wrapper = mountPanel();
    expect(wrapper.find('header button').exists()).toBe(false);
    expect(wrapper.findAll('[aria-label="home.removeOne"]')).toHaveLength(0);
  });

  it('空列表显示空态，且 clearable 也不显示清空按钮', () => {
    const wrapper = mountPanel({ clearable: true, items: [] });
    expect(wrapper.find('header button').exists()).toBe(false);
    expect(wrapper.text()).toContain('common.empty');
  });

  it('collapsed：未选中整卡全尺寸隐藏；展开态无 hidden 且 flex-1 撑满', () => {
    const collapsed = mountPanel({ collapsed: true });
    expect(collapsed.find('section').classes()).toContain('hidden');
    expect(collapsed.find('section').classes()).not.toContain('flex-1');

    const expanded = mountPanel({ collapsed: false });
    expect(expanded.find('section').classes()).not.toContain('hidden');
    expect(expanded.find('section').classes()).toEqual(
      expect.arrayContaining(['min-h-0', 'flex-1']),
    );
  });

  it('展开面板铺满：无论有无内容都 flex-1 撑满，空态仍显示空文案', () => {
    const filled = mountPanel();
    expect(filled.find('section').classes()).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']));

    const empty = mountPanel({ items: [] });
    expect(empty.find('section').classes()).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']));
    expect(empty.text()).toContain('common.empty');
  });
});
