import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type { Engine } from '@/api/types';

// 游客（未登录，无个人引擎）时的内置兜底，保证裸搜索可用。
const BUILTIN: Engine[] = [
  {
    id: -1,
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
    iconUrl: 'https://www.google.com/favicon.ico',
    sortOrder: 0,
    isDefault: true,
  },
  {
    id: -2,
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q={query}',
    iconUrl:
      'https://edgestatic.azureedge.net/shared/cms/lrs1c69a1j/logos/b3bed8dc525c4433afbdd24bb71ea2fc-png-w128.avif',
    sortOrder: 1,
    isDefault: false,
  },
  {
    id: -3,
    name: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q={query}',
    iconUrl: 'https://duckduckgo.com/static-assets/favicons/favicon.ico',
    sortOrder: 2,
    isDefault: false,
  },
];

export const useEnginesStore = defineStore('engines', () => {
  const engines = ref<Engine[]>([]);
  const currentId = ref<number | null>(null);

  async function load(): Promise<void> {
    try {
      engines.value = (await api.get<{ engines: Engine[] }>('/engines')).engines;
    } catch {
      engines.value = BUILTIN; // 游客兜底
    }
    const def = engines.value.find((e) => e.isDefault) ?? engines.value[0] ?? null;
    currentId.value = def ? def.id : null;
  }

  function select(id: number): void {
    if (engines.value.some((e) => e.id === id)) currentId.value = id;
  }

  /** 当前引擎的搜索 URL（{query} 替换并编码）。 */
  function searchUrl(query: string): string | null {
    const e = engines.value.find((x) => x.id === currentId.value);
    if (!e) return null;
    return e.urlTemplate.replace('{query}', encodeURIComponent(query));
  }

  async function create(input: Partial<Engine>): Promise<void> {
    await api.post('/engines', input);
    await load();
  }
  async function update(id: number, patch: Partial<Engine>): Promise<void> {
    await api.patch(`/engines/${id}`, patch);
    await load();
  }
  async function remove(id: number): Promise<void> {
    await api.del(`/engines/${id}`);
    await load();
  }
  async function setDefault(id: number): Promise<void> {
    await api.post(`/engines/${id}/default`);
    await load();
  }
  /** 乐观重排：先本地按 id 顺序重排，失败则回滚并重载。 */
  async function reorder(orderedIds: number[]): Promise<void> {
    const prev = engines.value;
    engines.value = orderedIds
      .map((id) => prev.find((e) => e.id === id))
      .filter((e): e is Engine => !!e);
    try {
      await api.post('/engines/reorder', { ids: orderedIds });
    } catch {
      engines.value = prev; // 回滚
      await load();
    }
  }

  /** 账号切换时清空（登出后回落游客兜底由下次 load 处理）。 */
  function reset(): void {
    engines.value = [];
    currentId.value = null;
  }

  return {
    engines,
    currentId,
    load,
    select,
    searchUrl,
    create,
    update,
    remove,
    setDefault,
    reorder,
    reset,
  };
});
