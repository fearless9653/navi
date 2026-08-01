import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePrefsStore } from './prefs';
import { api } from '@/api/client';
import type { Prefs } from '@/api/types';

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const PREFS: Prefs = {
  defaultSort: 'weight',
  recentCount: 8,
  pageSize: 24,
  backgroundType: 'none',
};

describe('prefs store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api.get).mockReset();
  });

  it('并发 load() 复用同一 in-flight 请求（首页 AppLayout/HomeView/MusicPlayer 三处并发只发一次）', async () => {
    const pending = deferred<{ prefs: Prefs }>();
    vi.mocked(api.get).mockReturnValue(pending.promise);
    const store = usePrefsStore();

    const a = store.load();
    const b = store.load();
    const c = store.load();

    expect(api.get).toHaveBeenCalledTimes(1);

    pending.resolve({ prefs: PREFS });
    await Promise.all([a, b, c]);

    expect(store.prefs?.recentCount).toBe(8);
  });

  it('请求完成后 in-flight 复位，可再次 load()', async () => {
    vi.mocked(api.get).mockResolvedValue({ prefs: PREFS });
    const store = usePrefsStore();

    await store.load();
    await store.load();

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('慢速在途 load 不覆盖已落地的 update（写序号守卫）', async () => {
    const pending = deferred<{ prefs: Prefs }>();
    vi.mocked(api.get).mockReturnValue(pending.promise);
    vi.mocked(api.patch).mockResolvedValue({ prefs: { ...PREFS, recentCount: 99 } });
    const store = usePrefsStore();

    const loadP = store.load(); // GET 在途
    await store.update({ recentCount: 99 }); // PATCH 先落地
    expect(store.prefs?.recentCount).toBe(99);

    pending.resolve({ prefs: { ...PREFS, recentCount: 8 } }); // 更旧的 GET 后到
    await loadP;
    expect(store.prefs?.recentCount).toBe(99); // 未被旧 GET 覆盖
  });
});
