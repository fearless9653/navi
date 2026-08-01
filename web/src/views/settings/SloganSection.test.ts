import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { usePrefsStore } from '@/stores/prefs';
import { useSloganFont } from '@/composables/useSloganFont';
import SloganSection from './SloganSection.vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('SloganSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    window.queryLocalFonts = undefined;
    useSloganFont().setSelectedSloganFontFamily('');
  });

  it('saves the personal slogan preference when the input loses focus', async () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();
    const update = vi.spyOn(prefs, 'update').mockResolvedValue();

    const wrapper = mount(SloganSection);
    await Promise.resolve();
    await nextTick();

    const input = wrapper.find('[data-test="slogan-input"]');
    await input.setValue('把时间留给热爱的事。');
    await input.trigger('blur');

    expect(update).toHaveBeenCalledWith({ slogan: '把时间留给热爱的事。' });
  });

  it('clears the personal slogan as null when the input loses focus', async () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '把时间留给热爱的事。',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();
    const update = vi.spyOn(prefs, 'update').mockResolvedValue();

    const wrapper = mount(SloganSection);
    await Promise.resolve();
    await nextTick();

    const input = wrapper.find('[data-test="slogan-input"]');
    await input.setValue('');
    await input.trigger('blur');

    expect(update).toHaveBeenCalledWith({ slogan: null });
  });

  it('does not render a separate personal slogan save button', async () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();

    const wrapper = mount(SloganSection);
    await Promise.resolve();
    await nextTick();

    expect(wrapper.find('[data-test="slogan-save"]').exists()).toBe(false);
  });

  it('renders the slogan surface on a translucent glass surface', () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();

    const wrapper = mount(SloganSection);

    const surface = wrapper.find('[data-test="slogan-surface"]');

    expect(surface.exists()).toBe(true);
    expect(surface.classes()).toContain('ui-surface-translucent');
  });

  it('stores the selected slogan font in the browser without updating account prefs', async () => {
    window.queryLocalFonts = vi.fn().mockResolvedValue([
      {
        family: 'Source Han Sans SC',
        fullName: 'Source Han Sans SC Regular',
        postscriptName: 'SourceHanSansSC-Regular',
        style: 'Regular',
      },
    ]);
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();
    const update = vi.spyOn(prefs, 'update').mockResolvedValue();

    const wrapper = mount(SloganSection);
    await Promise.resolve();
    await nextTick();

    await wrapper.find('[data-test="slogan-load-local-fonts"]').trigger('click');
    await Promise.resolve();
    await nextTick();

    // 打开自绘下拉，选项 teleport 到 body，按标签点选目标字体。
    await wrapper.find('[data-test="slogan-font-select"]').trigger('click');
    await nextTick();
    const opt = Array.from(document.body.querySelectorAll('[role="option"]')).find(
      (el) => el.textContent?.trim() === 'Source Han Sans SC',
    );
    expect(opt).toBeTruthy();
    (opt as HTMLElement).click();
    await nextTick();

    expect(localStorage.getItem('navi_slogan_font_family')).toBe('Source Han Sans SC');
    expect(update).not.toHaveBeenCalled();
  });

  it('stores a manually entered slogan font for browsers that cannot enumerate fonts', async () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();
    const update = vi.spyOn(prefs, 'update').mockResolvedValue();

    const wrapper = mount(SloganSection);
    await Promise.resolve();
    await nextTick();

    const input = wrapper.find('[data-test="slogan-font-manual"]');
    await input.setValue('Source Han Sans SC');
    await input.trigger('blur');

    expect(localStorage.getItem('navi_slogan_font_family')).toBe('Source Han Sans SC');
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks saving when the slogan exceeds the raw length limit', async () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();
    const update = vi.spyOn(prefs, 'update').mockResolvedValue();

    const wrapper = mount(SloganSection);
    await Promise.resolve();
    await nextTick();

    // 1001 字符：超出 1000 原始上限（可见字同样超限），失焦时应被前端阻断、不发请求。
    const input = wrapper.find('[data-test="slogan-input"]');
    await input.setValue('a'.repeat(1001));
    await input.trigger('blur');

    expect(update).not.toHaveBeenCalled();
  });
});
