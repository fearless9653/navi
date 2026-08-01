import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { usePrefsStore } from '@/stores/prefs';
import PreferencesSection from './PreferencesSection.vue';
import type { SortKey } from '@/api/types';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('PreferencesSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('saves the default sort preference when the select changes', async () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();
    const update = vi.spyOn(prefs, 'update').mockResolvedValue();

    const wrapper = mount(PreferencesSection, { attachTo: document.body });
    await Promise.resolve();
    await nextTick();

    // 打开自绘下拉，选中「name」项（i18n 被 mock，label 即 key 'sort.name'）。
    await wrapper.find('[role="combobox"]').trigger('click');
    await nextTick();
    const opts = Array.from(document.body.querySelectorAll('[role="option"]'));
    const nameOpt = opts.find((el) => el.textContent?.trim() === 'sort.name');
    expect(nameOpt).toBeTruthy();
    (nameOpt as HTMLElement).click();
    await nextTick();

    expect(update).toHaveBeenCalledWith({ defaultSort: 'name' satisfies SortKey });

    wrapper.unmount();
  });

  it('renders the bookmark list surface on a translucent glass surface', () => {
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();

    const wrapper = mount(PreferencesSection);

    const surface = wrapper.find('[data-test="preferences-surface"]');

    expect(surface.exists()).toBe(true);
    expect(surface.classes()).toContain('ui-surface-translucent');
  });
});
