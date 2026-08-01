import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import HomeSlogan from './HomeSlogan.vue';
import { useSloganFont } from '@/composables/useSloganFont';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('HomeSlogan', () => {
  beforeEach(() => {
    localStorage.clear();
    useSloganFont().setSelectedSloganFontFamily('');
  });

  it('shows the custom slogan with the default app font', () => {
    const wrapper = mount(HomeSlogan, {
      props: {
        slogan: '今日宜专注。',
      },
    });

    expect(wrapper.text()).toContain('今日宜专注。');
    expect(wrapper.find('[data-test="home-slogan"]').classes()).toContain('home-slogan');
  });

  it('does not reference a dedicated WenKai slogan font', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'web/src/components/home/HomeSlogan.vue'),
      'utf8',
    );

    expect(source).not.toContain('font-kai');
    expect(source).not.toContain('WenKai');
  });

  it('uses the selected local font when this browser has one', () => {
    useSloganFont().setSelectedSloganFontFamily('Source Han Sans SC');

    const wrapper = mount(HomeSlogan, {
      props: {
        slogan: '今日宜专注。',
      },
    });

    expect(wrapper.find('[data-test="home-slogan"]').attributes('style')).toContain(
      'Source Han Sans SC',
    );
  });

  it('prevents the home slogan from being selected with the mouse', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'web/src/components/home/HomeSlogan.vue'),
      'utf8',
    );

    expect(source).toContain('user-select: none;');
    expect(source).toContain('.home-slogan::after');
    expect(source).toContain('pointer-events: auto;');
  });

  it('渲染加粗段为更重的字重', () => {
    const wrapper = mount(HomeSlogan, { props: { slogan: '<b>hi</b>' } });
    const style = wrapper.find('[data-test="home-slogan"] span').attributes('style') ?? '';
    expect(style).toMatch(/font-weight:\s*900/);
    expect(wrapper.text()).toContain('hi');
  });

  it('渲染颜色段为对应 color', () => {
    const wrapper = mount(HomeSlogan, { props: { slogan: '<c=red>hi</c>' } });
    const style = wrapper.find('[data-test="home-slogan"] span').attributes('style') ?? '';
    expect(style).toMatch(/color:\s*red/);
  });

  it('渲染斜体与删除线', () => {
    const italic = mount(HomeSlogan, { props: { slogan: '<i>hi</i>' } });
    expect(italic.find('[data-test="home-slogan"] span').attributes('style') ?? '').toMatch(
      /font-style:\s*italic/,
    );
    const strike = mount(HomeSlogan, { props: { slogan: '<s>hi</s>' } });
    expect(strike.find('[data-test="home-slogan"] span').attributes('style') ?? '').toMatch(
      /text-decoration:\s*line-through/,
    );
  });

  it('纯文本渲染为单个 span', () => {
    const wrapper = mount(HomeSlogan, { props: { slogan: '今日宜专注。' } });
    expect(wrapper.findAll('[data-test="home-slogan"] span')).toHaveLength(1);
  });

  it('不使用 v-html（避免 XSS）', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'web/src/components/home/HomeSlogan.vue'),
      'utf8',
    );
    expect(source).not.toContain('v-html');
  });
});
