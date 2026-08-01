import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsLayout from './SettingsLayout.vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('SettingsLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the settings navigation on a translucent glass surface', () => {
    const wrapper = mount(SettingsLayout, {
      global: {
        stubs: {
          AppLayout: { template: '<main><slot /></main>' },
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<section />' },
        },
      },
    });

    const nav = wrapper.find('[data-test="settings-nav-surface"]');

    expect(nav.exists()).toBe(true);
    expect(nav.classes()).toContain('ui-surface-translucent');
  });

  it('keeps the settings navigation surface from stretching with long content', () => {
    const wrapper = mount(SettingsLayout, {
      global: {
        stubs: {
          AppLayout: { template: '<main><slot /></main>' },
          RouterLink: { template: '<a><slot /></a>' },
          RouterView: { template: '<section class="min-h-[2000px]" />' },
        },
      },
    });

    const nav = wrapper.find('[data-test="settings-nav-surface"]');

    expect(nav.classes()).toContain('self-start');
  });
});
