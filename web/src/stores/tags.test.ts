import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTagsStore } from './tags';
import { api } from '@/api/client';
import type { Tag } from '@/api/types';

vi.mock('@/api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function tag(id: number): Tag {
  return {
    id,
    name: `tag-${id}`,
    parentId: null,
    path: String(id),
    createdDate: '2026-01-01T00:00:00.000Z',
    lastModifiedDate: '2026-01-01T00:00:00.000Z',
  };
}

describe('tags store loadAll', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api.get).mockReset();
  });

  it('并发 loadAll() 复用同一 in-flight 请求，不重复 GET /tags', async () => {
    const pending = deferred<{ tags: Tag[] }>();
    vi.mocked(api.get).mockReturnValue(pending.promise);
    const store = useTagsStore();

    const a = store.loadAll();
    const b = store.loadAll();

    expect(api.get).toHaveBeenCalledTimes(1);

    pending.resolve({ tags: [tag(1)] });
    await Promise.all([a, b]);

    expect(store.tags).toHaveLength(1);
  });

  it('已加载后 loadAll() 幂等跳过，不再请求', async () => {
    vi.mocked(api.get).mockResolvedValue({ tags: [tag(1)] });
    const store = useTagsStore();

    await store.loadAll();
    await store.loadAll();

    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
