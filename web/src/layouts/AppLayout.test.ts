import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AppLayout from './AppLayout.vue';
import { useAuthStore } from '@/stores/auth';
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

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    backgroundStyle: { value: { backgroundImage: '' } },
    overlayStyle: { value: {} },
    hasBackground: false,
    imageLoaded: true,
    handleImageLoad: vi.fn(),
    handleImageError: vi.fn(),
  }),
}));

describe('AppLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('does not render the music player itself', () => {
    const auth = useAuthStore();
    vi.spyOn(usePrefsStore(), 'load').mockResolvedValue();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };

    const wrapper = mount(AppLayout, {
      slots: {
        default: '<div>content</div>',
      },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          AccountMenu: { template: '<div data-test="account-menu" />' },
          MusicPlayer: { template: '<div data-test="music-player" />' },
        },
      },
    });

    expect(wrapper.find('[data-test="music-player"]').exists()).toBe(false);
  });

  it('renders a shine layer inside the logo link', () => {
    vi.spyOn(usePrefsStore(), 'load').mockResolvedValue();

    const wrapper = mount(AppLayout, {
      slots: {
        default: '<div>content</div>',
      },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          AccountMenu: { template: '<div data-test="account-menu" />' },
        },
      },
    });

    expect(wrapper.find('.app-logo-link .app-logo-shine').exists()).toBe(true);
  });

  it('suppresses the logo hover animation after activating the home link until pointer leaves', async () => {
    vi.spyOn(usePrefsStore(), 'load').mockResolvedValue();

    const wrapper = mount(AppLayout, {
      slots: {
        default: '<div>content</div>',
      },
      global: {
        stubs: {
          RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
          AccountMenu: { template: '<div data-test="account-menu" />' },
        },
      },
    });

    const logo = wrapper.find('.app-logo-link');
    await logo.trigger('click');

    expect(logo.classes()).toContain('app-logo-hover-suppressed');

    await logo.trigger('pointerleave');

    expect(logo.classes()).not.toContain('app-logo-hover-suppressed');
  });

  it('keeps logo hover suppressed across layout remount after navigation', async () => {
    vi.spyOn(usePrefsStore(), 'load').mockResolvedValue();

    const firstWrapper = mount(AppLayout, {
      slots: {
        default: '<div>settings</div>',
      },
      global: {
        stubs: {
          RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
          AccountMenu: { template: '<div data-test="account-menu" />' },
        },
      },
    });

    await firstWrapper.find('.app-logo-link').trigger('click');
    firstWrapper.unmount();

    const secondWrapper = mount(AppLayout, {
      slots: {
        default: '<div>home</div>',
      },
      global: {
        stubs: {
          RouterLink: { template: '<a v-bind="$attrs"><slot /></a>' },
          AccountMenu: { template: '<div data-test="account-menu" />' },
        },
      },
    });

    const remountedLogo = secondWrapper.find('.app-logo-link');
    expect(remountedLogo.classes()).toContain('app-logo-hover-suppressed');

    await remountedLogo.trigger('pointerleave');

    expect(remountedLogo.classes()).not.toContain('app-logo-hover-suppressed');
  });

  it('does not tie the logo shine to the surface color token', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/layouts/AppLayout.vue'), 'utf8');

    expect(source).not.toContain('var(--color-surface) 72%');
  });

  it('does not move the logo upward on hover', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/layouts/AppLayout.vue'), 'utf8');

    expect(source).not.toContain('translateY(-2px)');
  });
});
