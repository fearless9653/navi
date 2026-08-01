import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '@/api/client';
import type { Tag } from '@/api/types';

export const useTagsStore = defineStore('tags', () => {
  const tags = ref<Tag[]>([]); // 全量标签（兼容旧代码）
  const rootTags = ref<Tag[]>([]); // 根标签（懒加载模式）
  const childrenCache = new Map<number, Tag[]>(); // 父节点 → 子节点缓存（不需要响应式）

  /** id → tag 映射（由全量标签派生，供 O(1) 查找 path / 组装卡片标签）。 */
  const byId = computed(() => {
    const m = new Map<number, Tag>();
    for (const t of tags.value) m.set(t.id, t);
    return m;
  });

  /** parentId → 子标签列表（由全量标签派生，供级联选择器免请求展开）。 */
  const childrenByParent = computed(() => {
    const m = new Map<number | null, Tag[]>();
    for (const t of tags.value) {
      const key = t.parentId ?? null;
      const arr = m.get(key);
      if (arr) arr.push(t);
      else m.set(key, [t]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  });

  /** 加载全部标签（兼容旧代码，设置页等需要全量数据）。 */
  async function load(): Promise<void> {
    tags.value = (await api.get<{ tags: Tag[] }>('/tags')).tags;
  }

  // in-flight 去重：首页挂载时 HomeView 与 bm.load(detail=0) 可能并发调 loadAll，
  // 仅靠 length===0 守卫不抗并发（两处都读到空 → 各发一次 GET /tags）。
  let loadAllInFlight: Promise<void> | null = null;

  /** 幂等加载全量标签：已加载则跳过、并发共享同一请求（首页级联/卡片映射用）。 */
  async function loadAll(): Promise<void> {
    if (tags.value.length > 0) return;
    if (loadAllInFlight) return loadAllInFlight;
    loadAllInFlight = (async () => {
      try {
        await load();
      } finally {
        loadAllInFlight = null;
      }
    })();
    return loadAllInFlight;
  }

  /** 某父节点的子标签（含 childrenCount，从全量标签派生，无网络请求）。 */
  function childrenOf(parentId: number | null): Tag[] {
    const list = childrenByParent.value.get(parentId) ?? [];
    return list.map((t) => ({
      ...t,
      childrenCount: childrenByParent.value.get(t.id)?.length ?? 0,
    }));
  }

  /** 加载根标签（懒加载模式） */
  async function loadRoot(): Promise<void> {
    rootTags.value = (await api.get<{ tags: Tag[] }>('/tags?parent_id=null')).tags;
  }

  /** 加载指定父节点的子标签（懒加载模式） */
  async function loadChildren(parentId: number): Promise<Tag[]> {
    if (!childrenCache.has(parentId)) {
      const children = (await api.get<{ tags: Tag[] }>(`/tags?parent_id=${parentId}`)).tags;
      childrenCache.set(parentId, children);
    }
    return childrenCache.get(parentId)!;
  }

  /** 清空懒加载缓存（创建/更新/删除后调用） */
  function clearCache(): void {
    rootTags.value = [];
    childrenCache.clear();
  }

  async function create(name: string, parentId: number | null): Promise<void> {
    await api.post('/tags', { name, parentId });
    clearCache();
    await load(); // 兼容：刷新全量数据
  }
  async function update(
    id: number,
    patch: { name?: string; parentId?: number | null },
  ): Promise<void> {
    await api.patch(`/tags/${id}`, patch);
    clearCache();
    await load();
  }
  async function remove(id: number): Promise<void> {
    await api.del(`/tags/${id}`);
    clearCache();
    await load();
  }
  async function bulkDelete(ids: number[]): Promise<void> {
    await api.post('/tags/bulk-delete', { ids });
    clearCache();
    await load();
  }

  /** 账号切换时清空：全量/根/子缓存与在途去重，避免下个用户看到上个用户的标签。 */
  function reset(): void {
    tags.value = [];
    rootTags.value = [];
    childrenCache.clear();
    loadAllInFlight = null;
  }

  return {
    tags,
    rootTags,
    childrenCache,
    byId,
    load,
    loadAll,
    childrenOf,
    loadRoot,
    loadChildren,
    create,
    update,
    remove,
    bulkDelete,
    reset,
  };
});
