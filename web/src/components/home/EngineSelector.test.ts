import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import EngineSelector from './EngineSelector.vue';
import { useEnginesStore } from '@/stores/engines';
import type { Engine } from '@/api/types';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const GOOGLE: Engine = {
  id: 1,
  name: 'Google',
  urlTemplate: 'https://www.google.com/search?q={query}',
  iconUrl: 'https://www.google.com/favicon.ico',
  sortOrder: 0,
  isDefault: true,
};

const CUSTOM: Engine = {
  id: 2,
  name: 'Custom',
  urlTemplate: 'https://example.com/?q={query}',
  iconUrl: null,
  sortOrder: 1,
  isDefault: false,
};

function seed(list: Engine[], currentId = list[0]!.id): void {
  const store = useEnginesStore();
  store.engines = list;
  store.currentId = currentId;
}

function mountSelector(list: Engine[], currentId = list[0]!.id) {
  const pinia = createPinia();
  setActivePinia(pinia);
  seed(list, currentId);
  const wrapper = mount(EngineSelector, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  return wrapper;
}

describe('EngineSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('将当前引擎图标渲染为触发器水印，而不与名称并排', () => {
    const wrapper = mountSelector([GOOGLE, CUSTOM]);
    const trigger = wrapper.get('[role="combobox"]');
    const img = trigger.get('[data-test="engine-watermark"] img');
    expect(img.attributes('src')).toBe(GOOGLE.iconUrl);
    expect(trigger.findAll('img')).toHaveLength(1);
    expect(trigger.text()).toContain('Google');
    wrapper.unmount();
  });

  it('当前引擎没有图标时不渲染水印', () => {
    const wrapper = mountSelector([CUSTOM]);
    expect(wrapper.find('[data-test="engine-watermark"]').exists()).toBe(false);
    expect(wrapper.get('[role="combobox"]').text()).toContain('Custom');
    wrapper.unmount();
  });

  it('下拉选项仍使用与名称并排的小图标', async () => {
    const wrapper = mountSelector([GOOGLE, CUSTOM]);
    await wrapper.get('[role="combobox"]').trigger('click');
    await flushPromises();
    const optionImgs = Array.from(document.body.querySelectorAll('[role="option"] img'));
    expect(optionImgs).toHaveLength(1);
    expect(optionImgs[0]?.getAttribute('src')).toBe(GOOGLE.iconUrl);
    expect(optionImgs[0]?.className).toContain('h-4');
    wrapper.unmount();
  });

  it('图标加载失败时隐藏水印，避免放大后的占位块', async () => {
    const wrapper = mountSelector([GOOGLE]);
    await wrapper.get('[data-test="engine-watermark"] img').trigger('error');
    expect(wrapper.find('[data-test="engine-watermark"]').exists()).toBe(false);
    expect(wrapper.get('[role="combobox"]').text()).toContain('Google');
    wrapper.unmount();
  });

  it('触发器不渲染折叠箭头', () => {
    const wrapper = mountSelector([GOOGLE]);
    expect(wrapper.find('.engine-caret').exists()).toBe(false);
    expect(wrapper.get('[role="combobox"]').text()).toBe('Google');
    wrapper.unmount();
  });
});
