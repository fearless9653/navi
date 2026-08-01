import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBookmarksStore } from './bookmarks';
import { api } from '@/api/client';
import type { Bookmark } from '@/api/types';

vi.mock('@/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

function bookmark(id: number, name = `Bookmark ${id}`): Bookmark {
  return {
    id,
    url: `https://example.com/${id}`,
    name,
    description: null,
    faviconUrl: null,
    weight: id,
    isActive: true,
    lastVisitedAt: null,
    visitCount: 0,
    createdDate: '2026-01-01T00:00:00.000Z',
    lastModifiedDate: '2026-01-01T00:00:00.000Z',
    tags: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('bookmarks store list loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.patch).mockReset();
    vi.mocked(api.del).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses an in-flight list request with the same query key', async () => {
    const pending = deferred<{
      items: Bookmark[];
      total: number;
      page: number;
      pageSize: number;
    }>();
    vi.mocked(api.get).mockReturnValue(pending.promise);
    const store = useBookmarksStore();

    const first = store.load();
    const second = store.load();

    expect(api.get).toHaveBeenCalledTimes(1);

    pending.resolve({ items: [bookmark(1)], total: 1, page: 1, pageSize: 24 });
    await Promise.all([first, second]);

    expect(store.items.map((item) => item.id)).toEqual([1]);
    expect(store.loading).toBe(false);
  });

  it('serves a recently loaded identical list query from memory', async () => {
    vi.mocked(api.get).mockResolvedValue({
      items: [bookmark(1)],
      total: 1,
      page: 1,
      pageSize: 24,
    });
    const store = useBookmarksStore();

    await store.load();
    await store.load();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(store.items.map((item) => item.id)).toEqual([1]);
  });

  it('resets an externally-set loading flag when a load hits the short cache', async () => {
    // 复现「从设置页回主页卡加载」：HomeView 挂载时手动置 loading=true 盖住上一屏，
    // 依赖 load 复位；命中短缓存的提前返回路径若不复位，骨架屏永久卡死。
    vi.mocked(api.get).mockResolvedValue({ items: [bookmark(1)], total: 1, page: 1, pageSize: 24 });
    const store = useBookmarksStore();

    await store.load();

    // 模拟 HomeView 外部置真后再次同键 load（视口不变 → 同 key，命中缓存提前返回）。
    store.loading = true;
    await store.load();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(store.loading).toBe(false);
    expect(store.items.map((item) => item.id)).toEqual([1]);
  });

  it('bypasses the short cache when force is requested', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ items: [bookmark(1)], total: 1, page: 1, pageSize: 24 })
      .mockResolvedValueOnce({ items: [bookmark(2)], total: 1, page: 1, pageSize: 24 });
    const store = useBookmarksStore();

    await store.load();
    await store.load({ force: true });

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(store.items.map((item) => item.id)).toEqual([2]);
  });

  it('keeps older list responses from overwriting the latest query state', async () => {
    const first = deferred<{ items: Bookmark[]; total: number; page: number; pageSize: number }>();
    const second = deferred<{ items: Bookmark[]; total: number; page: number; pageSize: number }>();
    vi.mocked(api.get).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = useBookmarksStore();

    const firstLoad = store.load();
    store.setQuery('newer');
    const secondLoad = store.load();

    second.resolve({ items: [bookmark(2, 'newer')], total: 1, page: 1, pageSize: 24 });
    await secondLoad;
    first.resolve({ items: [bookmark(1, 'older')], total: 1, page: 1, pageSize: 24 });
    await firstLoad;

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(store.items.map((item) => item.name)).toEqual(['newer']);
    expect(store.query).toBe('newer');
    expect(store.loading).toBe(false);
  });

  it('does not retry non-transient errors (4xx) and sets the error flag', async () => {
    // status 4xx 视为不可重试：重试也是同样结果，直接落错误态、不放大请求。
    vi.mocked(api.get).mockRejectedValue({ status: 400 });
    const store = useBookmarksStore();

    await store.load();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(store.error).toBe(true);
    expect(store.loading).toBe(false);
    expect(store.items).toEqual([]);
  });

  it('auto-retries a transient error and recovers without surfacing failure', async () => {
    // 首次 503（网关瞬时），退避后重试成功——用户无感，不置错误态。
    vi.mocked(api.get)
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ items: [bookmark(1)], total: 1, page: 1, pageSize: 24 });
    const store = useBookmarksStore();

    const loading = store.load();
    // 推进退避计时器（首次重试 300ms），让重试真正发起。
    await vi.advanceTimersByTimeAsync(300);
    await loading;

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(store.error).toBe(false);
    expect(store.loading).toBe(false);
    expect(store.items.map((item) => item.id)).toEqual([1]);
  });

  it('gives up after exhausting retries on persistent transient errors', async () => {
    // 持续 503：3 次尝试（1 次首发 + 2 次重试）全败，最终置错误态。
    vi.mocked(api.get).mockRejectedValue({ status: 503 });
    const store = useBookmarksStore();

    const loading = store.load();
    await vi.advanceTimersByTimeAsync(300 + 600);
    await loading;

    expect(api.get).toHaveBeenCalledTimes(3);
    expect(store.error).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('treats a network error (no status) as transient and retries', async () => {
    // fetch reject 的裸网络错误无 status，视为瞬时，重试后恢复。
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ items: [bookmark(1)], total: 1, page: 1, pageSize: 24 });
    const store = useBookmarksStore();

    const loading = store.load();
    await vi.advanceTimersByTimeAsync(300);
    await loading;

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(store.items.map((item) => item.id)).toEqual([1]);
  });

  it('clears the error flag and recovers on a manual retry', async () => {
    vi.mocked(api.get)
      .mockRejectedValueOnce({ status: 400 })
      .mockResolvedValueOnce({ items: [bookmark(1)], total: 1, page: 1, pageSize: 24 });
    const store = useBookmarksStore();

    await store.load();
    expect(store.error).toBe(true);

    // 失败响应未入缓存，force 重试重新发起请求并成功恢复。
    await store.load({ force: true });

    expect(store.error).toBe(false);
    expect(store.loading).toBe(false);
    expect(store.items.map((item) => item.id)).toEqual([1]);
  });

  it('does not cache a failed response so the next load refetches', async () => {
    vi.mocked(api.get)
      .mockRejectedValueOnce({ status: 400 })
      .mockResolvedValueOnce({ items: [bookmark(1)], total: 1, page: 1, pageSize: 24 });
    const store = useBookmarksStore();

    await store.load();
    await store.load();

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(store.items.map((item) => item.id)).toEqual([1]);
  });

  it('loadTops hits /bookmarks/top with the limit and stores the three lists', async () => {
    const tops = {
      visits: [{ id: 1, url: 'https://a.com', name: 'A', faviconUrl: null }],
      weight: [{ id: 2, url: 'https://b.com', name: 'B', faviconUrl: null }],
      created: [{ id: 3, url: 'https://c.com', name: 'C', faviconUrl: null }],
    };
    vi.mocked(api.get).mockResolvedValue(tops);
    const store = useBookmarksStore();

    await store.loadTops(6);

    expect(api.get).toHaveBeenCalledWith('/bookmarks/top?limit=6');
    expect(store.tops).toEqual(tops);
  });

  it('serves repeated rails requests from cache within the TTL', async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], visits: [], weight: [], created: [] });
    const store = useBookmarksStore();

    await store.loadTops(6);
    await store.loadTops(6);
    await store.loadRecent(6);
    await store.loadRecent(6);

    // tops 与 recent 各只发一次请求，第二次命中缓存。
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('refetches rails data after the TTL elapses', async () => {
    vi.mocked(api.get).mockResolvedValue({ visits: [], weight: [], created: [] });
    const store = useBookmarksStore();

    await store.loadTops(6);
    vi.advanceTimersByTime(30_000);
    await store.loadTops(6);

    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent identical rails requests', async () => {
    const pending = deferred<{ visits: []; weight: []; created: [] }>();
    vi.mocked(api.get).mockReturnValue(pending.promise);
    const store = useBookmarksStore();

    const first = store.loadTops(6);
    const second = store.loadTops(6);

    expect(api.get).toHaveBeenCalledTimes(1);

    pending.resolve({ visits: [], weight: [], created: [] });
    await Promise.all([first, second]);
  });

  it('invalidates the rails cache after a write such as visit', async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [], visits: [], weight: [], created: [] });
    vi.mocked(api.post).mockResolvedValue(undefined);
    const store = useBookmarksStore();

    await store.loadTops(6);
    await store.visit(1);
    await store.loadTops(6);

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
