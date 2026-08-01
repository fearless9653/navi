import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import BackgroundSection from './BackgroundSection.vue';
import { usePrefsStore } from '@/stores/prefs';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock('@/composables/useBingWallpaper', () => ({
  useBingWallpaper: () => ({
    url: { value: null },
    loading: { value: false },
    error: { value: false },
    reload: vi.fn(),
  }),
}));

describe('BackgroundSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 8,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '',
    };
    vi.spyOn(prefs, 'load').mockResolvedValue();
  });

  it('renders background settings on a translucent glass surface', () => {
    const wrapper = mount(BackgroundSection);

    const surface = wrapper.find('[data-test="background-surface"]');

    expect(surface.exists()).toBe(true);
    expect(surface.classes()).toContain('ui-surface-translucent');
  });
});
