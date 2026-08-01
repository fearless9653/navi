import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/api/client';
import type {
  Bookmark,
  BookmarkListItem,
  BookmarkStatus,
  RecentBookmark,
  SortDir,
  SortKey,
  Tag,
  TopLists,
} from '@/api/types';
import { useTagsStore } from '@/stores/tags';

interface ListResponse {
  items: Bookmark[];
  total: number;
  page: number;
  pageSize: number;
}

/** 精简接口（detail=0）响应：items 仅带 tagIds。 */
interface ListResponseLite {
  items: BookmarkListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface LoadOptions {
  status?: BookmarkStatus;
  force?: boolean;
  /** 首页用精简接口：只取 tagIds，前端用全量标签映射组装 tags。 */
  detail?: boolean;
}

const LIST_CACHE_TTL_MS = 1000;
// 侧栏四面板（最近访问 + 三榜单）缓存：主要吸收「切走标签页又切回」触发的
// visibilitychange 重拉（HomeView），TTL 内直接命中、不发请求。榜单数据不敏感，
// 30s 内的陈旧可接受；本端写操作（visit/增改删/清除）会主动失效，不受 TTL 约束。
const RAILS_CACHE_TTL_MS = 30_000;

// 主列表读取的自动重试：每项为一次重试前的退避基准（ms），故最多重试 2 次（共 3 次尝试），
// 指数退避 ~300ms → ~600ms。仅吸收「瞬时抖动」（网络 reset / 超时 / 502/503/504），
// 让偶发失败对用户无感；耗尽或遇不可重试错误才落到错误态。刻意只用于读列表，不上全局
// api 层——写操作（POST/DELETE）非幂等，盲目重试有副作用。
const LIST_RETRY_DELAYS_MS = [300, 600];

/**
 * 是否值得自动重试的「瞬时」错误。
 * 按鸭子类型看 error.status（ApiException 携带）：网关类 502/503/504 才重试；
 * 其余 HTTP 状态（401/403/404/409/4xx/5xx-业务）重试也是同样结果，不重试、快速止损。
 * 无 status（fetch reject 的网络错误 / 超时）视为瞬时，重试。
 * 刻意不 import ApiException 做 instanceof：测试整体 mock 了 @/api/client，类会被抹掉。
 */
function isTransientError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    return status === 502 || status === 503 || status === 504;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const useBookmarksStore = defineStore('bookmarks', () => {
  const items = ref<Bookmark[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(24);
  const selectedTagIds = ref<number[]>([]);
  const query = ref('');
  const sort = ref<SortKey>('created');
  const dir = ref<SortDir>('desc');
  const recent = ref<RecentBookmark[]>([]);
  const tops = ref<TopLists>({ visits: [], weight: [], created: [] });
  const loading = ref(false);
  // 主列表查询失败标记：驱动 BookmarkGrid 的「加载失败 + 重试」态。
  // 仅覆盖主列表（load）；侧栏榜单失败不置此位、不阻塞主区。
  const error = ref(false);

  const listCache = new Map<string, { savedAt: number; response: ListResponse }>();
  const inFlightLists = new Map<string, Promise<ListResponse>>();
  let latestListRequestId = 0;

  function buildListParams(opts: LoadOptions): URLSearchParams {
    const p = new URLSearchParams();
    if (selectedTagIds.value.length) {
      p.set('tags', [...selectedTagIds.value].sort((a, b) => a - b).join(','));
    }
    if (query.value.trim()) p.set('q', query.value.trim());
    if (opts.status) p.set('status', opts.status);
    p.set('sort', sort.value);
    p.set('dir', dir.value);
    p.set('page', String(page.value));
    p.set('pageSize', String(pageSize.value));
    if (opts.detail === false) p.set('detail', '0');
    return p;
  }

  /** 精简响应 → 统一 ListResponse：用全量标签映射把 tagIds 组装成 tags（按 path 排序）。 */
  function assembleLite(res: ListResponseLite): ListResponse {
    const byId = useTagsStore().byId;
    const items: Bookmark[] = res.items.map(({ tagIds, ...rest }) => {
      const tags = tagIds
        .map((id) => byId.get(id))
        .filter((t): t is Tag => t !== undefined)
        .sort((a, b) => a.path.localeCompare(b.path));
      return { ...rest, tags };
    });
    return { items, total: res.total, page: res.page, pageSize: res.pageSize };
  }

  function applyListResponse(res: ListResponse): void {
    items.value = res.items;
    total.value = res.total;
    page.value = res.page;
    pageSize.value = res.pageSize;
  }

  function clearListCache(): void {
    listCache.clear();
  }

  const railsCache = new Map<string, { savedAt: number; data: unknown }>();
  const inFlightRails = new Map<string, Promise<unknown>>();
  // rails 失效代际：写操作递增之，使「写之前发起、写之后才返回」的在途请求结果不再回填缓存。
  let railsGeneration = 0;

  function clearRailsCache(): void {
    railsCache.clear();
  }

  /** 写操作后统一失效：主列表 + 侧栏（recent/top）。新增写操作时一律调它，别只清单侧。 */
  function invalidateAfterWrite(): void {
    clearListCache();
    clearRailsCache();
    inFlightRails.clear();
    railsGeneration++;
  }

  /** 侧栏请求的「短 TTL + in-flight 去重」缓存读：以完整路径为键，仅成功且未被写失效的响应入缓存。 */
  async function cachedRailsGet<T>(path: string): Promise<T> {
    const hit = railsCache.get(path);
    if (hit && Date.now() - hit.savedAt < RAILS_CACHE_TTL_MS) return hit.data as T;

    const gen = railsGeneration;
    let request = inFlightRails.get(path) as Promise<T> | undefined;
    if (!request) {
      request = api.get<T>(path);
      inFlightRails.set(path, request);
    }
    try {
      const data = await request;
      // 期间发生过写失效则丢弃：避免写前发起的陈旧数据回填缓存。
      if (gen === railsGeneration) railsCache.set(path, { savedAt: Date.now(), data });
      return data;
    } finally {
      if (inFlightRails.get(path) === request) inFlightRails.delete(path);
    }
  }

  /**
   * 包裹单次尝试 attempt，失败按指数退避自动重试瞬时错误。
   * 耗尽重试次数或遇不可重试（非瞬时）错误时抛出，交由 load 的 catch 落错误态。
   */
  async function fetchListWithRetry(attempt: () => Promise<ListResponse>): Promise<ListResponse> {
    for (let i = 0; ; i++) {
      try {
        return await attempt();
      } catch (e) {
        const delay = LIST_RETRY_DELAYS_MS[i];
        if (delay === undefined || !isTransientError(e)) throw e;
        await sleep(delay);
      }
    }
  }

  async function load(opts: LoadOptions = {}): Promise<void> {
    const requestId = ++latestListRequestId;
    const p = buildListParams(opts);
    const key = p.toString();
    const cached = listCache.get(key);

    if (!opts.force && cached && Date.now() - cached.savedAt < LIST_CACHE_TTL_MS) {
      // 缓存命中提前返回：仍要收口 loading/error。HomeView 挂载时会先手动置
      // loading=true（用骨架盖住上一屏遗留内容），依赖本函数复位；若此路径不复位，
      // 命中缓存时骨架屏无人关闭、永久卡死。仅最新请求复位并应用，避免抹掉/覆盖
      // 更晚 in-flight 请求的状态（与下方 finally 的 requestId 守卫一致）。
      if (requestId === latestListRequestId) {
        applyListResponse(cached.response);
        loading.value = false;
        error.value = false;
      }
      return;
    }

    let request: Promise<ListResponse> | undefined;
    loading.value = true;
    error.value = false;
    try {
      request = !opts.force ? inFlightLists.get(key) : undefined;
      if (!request) {
        // 单次尝试：精简分支先确保全量标签就绪，再拉 lite 响应并组装 tags。
        const attempt = (): Promise<ListResponse> =>
          opts.detail === false
            ? (async () => {
                await useTagsStore().loadAll();
                const lite = await api.get<ListResponseLite>(`/bookmarks?${key}`);
                return assembleLite(lite);
              })()
            : api.get<ListResponse>(`/bookmarks?${key}`);
        // 自动重试包裹整个尝试（含标签加载），retry 促成的 promise 存入 inFlightLists，
        // 故并发同键 load 共享同一「带重试」的请求，不会各自重试放大压力。
        request = fetchListWithRetry(attempt);
        inFlightLists.set(key, request);
      }

      const res = await request;
      listCache.set(key, { savedAt: Date.now(), response: res });

      if (requestId === latestListRequestId) {
        applyListResponse(res);
      }
    } catch {
      // 查询失败：仅最新请求置错误态，驱动列表显示「加载失败 + 重试」。
      // 吞掉 rejection —— 所有调用方都是 void bm.load()，不吞会产生未处理 rejection；
      // 失败响应刻意不写 listCache，重试（force 或 TTL 过后）会重新发起。
      if (requestId === latestListRequestId) {
        error.value = true;
      }
    } finally {
      if (inFlightLists.get(key) === request) {
        inFlightLists.delete(key);
      }
      if (requestId === latestListRequestId) {
        loading.value = false;
      }
    }
  }

  let recentLimit: number | undefined;

  async function loadRecent(limit?: number): Promise<void> {
    recentLimit = limit;
    const q = limit ? `?limit=${limit}` : '';
    const res = await cachedRailsGet<{ items: RecentBookmark[] }>(`/bookmarks/recent${q}`);
    recent.value = res.items;
  }

  /** 首页三榜单（访问次数 / 自设权重 / 创建时间），只读，无清除操作。 */
  async function loadTops(limit?: number): Promise<void> {
    const q = limit ? `?limit=${limit}` : '';
    tops.value = await cachedRailsGet<TopLists>(`/bookmarks/top${q}`);
  }

  async function clearRecent(): Promise<void> {
    await api.del('/bookmarks/recent');
    invalidateAfterWrite();
    recent.value = [];
  }

  async function clearRecentOne(id: number): Promise<void> {
    await api.del(`/bookmarks/recent/${id}`);
    invalidateAfterWrite();
    await loadRecent(recentLimit);
  }

  async function visit(id: number): Promise<void> {
    await api.post(`/bookmarks/${id}/visit`);
    invalidateAfterWrite();
  }

  function setTagIds(ids: number[]): void {
    selectedTagIds.value = ids;
    page.value = 1;
  }
  function setQuery(q: string): void {
    query.value = q;
    page.value = 1;
  }
  function setSort(s: SortKey): void {
    sort.value = s;
    page.value = 1;
  }
  function setDir(next: SortDir): void {
    dir.value = next;
    page.value = 1;
  }
  function setPage(p: number): void {
    page.value = p;
  }

  // —— 管理（Task 4 用） ——
  async function create(input: Record<string, unknown>): Promise<void> {
    await api.post('/bookmarks', input);
    invalidateAfterWrite();
  }
  async function update(id: number, patch: Record<string, unknown>): Promise<void> {
    await api.patch(`/bookmarks/${id}`, patch);
    invalidateAfterWrite();
  }
  async function remove(id: number): Promise<void> {
    await api.del(`/bookmarks/${id}`);
    invalidateAfterWrite();
  }
  async function bulkDelete(ids: number[]): Promise<void> {
    await api.post('/bookmarks/bulk-delete', { ids });
    invalidateAfterWrite();
  }
  async function bulkTags(
    bookmarkIds: number[],
    tagIds: number[],
    op: 'assign' | 'remove',
  ): Promise<void> {
    await api.post('/bookmarks/bulk-tags', { bookmarkIds, tagIds, op });
    invalidateAfterWrite();
  }

  /** 账号切换时清空：列表/筛选状态 + 全部缓存与在途请求，防止跨用户串号或用旧筛选拉新账号。 */
  function reset(): void {
    items.value = [];
    total.value = 0;
    page.value = 1;
    pageSize.value = 24;
    selectedTagIds.value = [];
    query.value = '';
    sort.value = 'created';
    dir.value = 'desc';
    recent.value = [];
    tops.value = { visits: [], weight: [], created: [] };
    loading.value = false;
    error.value = false;
    listCache.clear();
    railsCache.clear();
    inFlightLists.clear();
    inFlightRails.clear();
    latestListRequestId = 0;
    recentLimit = undefined;
  }

  return {
    items,
    total,
    page,
    pageSize,
    selectedTagIds,
    query,
    sort,
    dir,
    recent,
    tops,
    loading,
    error,
    load,
    loadRecent,
    loadTops,
    clearRecent,
    clearRecentOne,
    visit,
    setTagIds,
    setQuery,
    setSort,
    setDir,
    setPage,
    create,
    update,
    remove,
    bulkDelete,
    bulkTags,
    reset,
  };
});
