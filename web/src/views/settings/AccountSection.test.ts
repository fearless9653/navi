import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AccountSection from './AccountSection.vue';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('AccountSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders password settings on a translucent glass surface', () => {
    const wrapper = mount(AccountSection);

    const surface = wrapper.find('[data-test="account-surface"]');

    expect(surface.exists()).toBe(true);
    expect(surface.classes()).toContain('ui-surface-translucent');
  });
});
