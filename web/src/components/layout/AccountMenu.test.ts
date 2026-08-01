import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import AccountMenu from './AccountMenu.vue';
import { useAuthStore } from '@/stores/auth';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      locale: 'zh',
      t: (key: string) => key,
    }),
  };
});

describe('AccountMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    push.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('登出时调用 auth.logout 并跳转登录页（数据/音频清理由 auth store 内 resetDataStores 负责）', async () => {
    const auth = useAuthStore();
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
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue();

    const wrapper = mount(AccountMenu, {
      global: {
        stubs: {
          BaseDropdown: {
            template:
              '<div><slot name="trigger" :toggle="() => {}" /><slot :close="() => {}" /></div>',
          },
        },
      },
    });

    await wrapper.findAll('button').at(-2)!.trigger('click');

    expect(logout).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith({ name: 'login' });
  });
});
