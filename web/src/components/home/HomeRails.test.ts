import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import HomeRails from './HomeRails.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

/** RailPanel 打桩：暴露 title/clearable/collapsed，便于断言分段条的单开逻辑。
 *  props 必须带类型：布尔简写 `clearable` 传空串，仅类型式声明会转换为 true。 */
const RailPanelStub = {
  props: { title: String, items: Array, clearable: Boolean, collapsed: Boolean },
  template:
    '<div data-test="panel" :data-title="title" :data-clearable="String(clearable)"' +
    ' :data-collapsed="String(collapsed)" />',
};

function mountRails(selected: 'recent' | 'visits' | 'weight' | 'created' = 'recent') {
  return mount(HomeRails, {
    props: { selected },
    global: { stubs: { RailPanel: RailPanelStub } },
  });
}

describe('HomeRails', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('渲染四个面板（全称标题）与四个分段（短标签 + 全称 aria-label）', () => {
    const wrapper = mountRails();
    const titles = ['home.recent', 'home.byVisits', 'home.byWeight', 'home.byCreated'];
    const shortLabels = ['home.segRecent', 'home.segVisits', 'home.segWeight', 'home.segCreated'];
    // 面板标题用全称。
    expect(wrapper.findAll('[data-test="panel"]').map((p) => p.attributes('data-title'))).toEqual(
      titles,
    );
    // 分段按钮显示短标签，避免窄列换行。
    expect(wrapper.findAll('.rails-seg button').map((b) => b.text())).toEqual(shortLabels);
    // 无障碍/悬浮仍暴露全称。
    expect(wrapper.findAll('.rails-seg button').map((b) => b.attributes('aria-label'))).toEqual(
      titles,
    );
  });

  it('仅最近访问面板可清除（clearable），三个榜单只读', () => {
    const panels = mountRails().findAll('[data-test="panel"]');
    expect(panels.map((p) => p.attributes('data-clearable'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
  });

  it('受控单开：collapsed 由 selected 驱动，点击 emit update:selected，点当前段不 emit', async () => {
    const wrapper = mountRails('recent');
    const collapsedStates = () =>
      wrapper.findAll('[data-test="panel"]').map((p) => p.attributes('data-collapsed'));
    const ariaStates = () =>
      wrapper.findAll('.rails-seg button').map((b) => b.attributes('aria-selected'));

    // 默认最近访问展开（永远恰好一个，无全收起态）。
    expect(collapsedStates()).toEqual(['false', 'true', 'true', 'true']);
    expect(ariaStates()).toEqual(['true', 'false', 'false', 'false']);

    // 点「访问次数」段：受控组件只对外 emit（父级负责改 prop、驱动懒加载）。
    await wrapper.find('[data-test="rails-seg-visits"]').trigger('click');
    expect(wrapper.emitted('update:selected')).toEqual([['visits']]);

    // 父级更新 selected 后，单开切换生效：只展开访问次数。
    await wrapper.setProps({ selected: 'visits' });
    expect(collapsedStates()).toEqual(['true', 'false', 'true', 'true']);
    expect(ariaStates()).toEqual(['false', 'true', 'false', 'false']);

    // 再点「访问次数」（当前选中段）：无效，不再 emit。
    await wrapper.find('[data-test="rails-seg-visits"]').trigger('click');
    expect(wrapper.emitted('update:selected')).toEqual([['visits']]);
  });
});
