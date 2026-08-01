import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth';
import { useTagsStore } from './tags';
import { usePrefsStore } from './prefs';
import { useBookmarksStore } from './bookmarks';
import { api } from '@/api/client';
import type { Prefs, PublicUser } from '@/api/types';

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

const USER: PublicUser = {
  id: 2,
  email: 'b@example.com',
  displayName: 'B',
  isAdmin: false,
  isActive: true,
  mustChangePassword: false,
  createdDate: '2026-01-01T00:00:00.000Z',
  lastModifiedDate: '2026-01-01T00:00:00.000Z',
};

const PREFS: Prefs = {
  defaultSort: 'weight',
  recentCount: 8,
  pageSize: 24,
  backgroundType: 'none',
};

/** 造出「上个用户」的残留数据，用于验证账号切换后被清空。 */
function seedPreviousUserData() {
  const tags = useTagsStore();
  const prefs = usePrefsStore();
  const bm = useBookmarksStore();
  tags.tags = [{ id: 1, name: 'a', parentId: null, path: 'a' }] as unknown as typeof tags.tags;
  prefs.prefs = { ...PREFS };
  bm.query = 'old';
  bm.selectedTagIds = [9];
  bm.page = 3;
  return { tags, prefs, bm };
}

describe('auth store 账号切换重置', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api.post).mockReset();
  });

  it('login 成功后清空上个会话数据、再置新用户（防跨用户串号）', async () => {
    const { tags, prefs, bm } = seedPreviousUserData();
    vi.mocked(api.post).mockResolvedValue({ user: USER });
    const auth = useAuthStore();

    await auth.login('b@example.com', 'pw');

    expect(auth.user?.id).toBe(2);
    expect(tags.tags).toEqual([]);
    expect(prefs.prefs).toBeNull();
    expect(bm.query).toBe('');
    expect(bm.selectedTagIds).toEqual([]);
    expect(bm.page).toBe(1);
  });

  it('logout 清空数据 store 与当前用户', async () => {
    const { tags, prefs } = seedPreviousUserData();
    const auth = useAuthStore();
    auth.user = { ...USER };
    vi.mocked(api.post).mockResolvedValue({ ok: true });

    await auth.logout();

    expect(auth.user).toBeNull();
    expect(tags.tags).toEqual([]);
    expect(prefs.prefs).toBeNull();
  });

  it('logout 即使服务端请求失败也清本地态（finally）', async () => {
    const auth = useAuthStore();
    auth.user = { ...USER };
    vi.mocked(api.post).mockRejectedValue(new Error('network'));

    await auth.logout();

    expect(auth.user).toBeNull();
  });
});
