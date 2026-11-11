/** 搜索建议代理：仅请求内置白名单上游（Google / Baidu），失败降级为空列表。 */
import { FETCH_USER_AGENT } from './fetcher';
import type { SuggestSource } from './engines';

export type { SuggestSource };

const GOOGLE_ENDPOINT = 'https://suggestqueries.google.com/complete/search';
const BAIDU_ENDPOINT = 'https://www.baidu.com/sugrec';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_CACHE_TTL_MS = 45_000;
const CACHE_SOFT_CAP = 256;
const MAX_BODY_CHARS = 256 * 1024;

export interface SuggestCacheEntry {
  expiresAt: number;
  suggestions: string[];
}

export type SuggestCache = Map<string, SuggestCacheEntry>;
export type SuggestInflight = Map<string, Promise<string[]>>;

export interface FetchSuggestionsOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  cache?: SuggestCache;
  inflight?: SuggestInflight;
  timeoutMs?: number;
  maxResults?: number;
  cacheTtlMs?: number;
}

const defaultCache: SuggestCache = new Map();
const defaultInflight: SuggestInflight = new Map();

export function suggestCacheKey(source: SuggestSource, q: string): string {
  return `${source}:${q}`;
}

export function buildSuggestUrl(source: SuggestSource, q: string): string {
  if (source === 'google') {
    const url = new URL(GOOGLE_ENDPOINT);
    url.searchParams.set('client', 'firefox');
    url.searchParams.set('q', q);
    url.searchParams.set('hl', 'zh-CN');
    url.searchParams.set('gl', 'cn');
    return url.toString();
  }
  const url = new URL(BAIDU_ENDPOINT);
  url.searchParams.set('ie', 'utf-8');
  url.searchParams.set('json', '1');
  url.searchParams.set('prod', 'pc');
  url.searchParams.set('wd', q);
  return url.toString();
}

/** 把上游响应规范成字符串数组：过滤非字符串/空白，保持原序，截到上限。 */
export function normalizeSuggestions(raw: unknown[], maxResults = DEFAULT_MAX_RESULTS): string[] {
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const term = item.trim();
    if (!term) continue;
    out.push(term);
    if (out.length >= maxResults) break;
  }
  return out;
}

function parseGooglePayload(data: unknown, maxResults: number): string[] {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return normalizeSuggestions(data[1], maxResults);
}

function parseBaiduPayload(data: unknown, maxResults: number): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const group = (data as { g?: unknown }).g;
  if (!Array.isArray(group)) return [];
  const terms = group.map((item) =>
    typeof item === 'object' && item !== null ? (item as { q?: unknown }).q : undefined,
  );
  return normalizeSuggestions(terms, maxResults);
}

function cacheGet(cache: SuggestCache, key: string, now: number): string[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return hit.suggestions;
}

function cacheSet(
  cache: SuggestCache,
  key: string,
  suggestions: string[],
  now: number,
  ttlMs: number,
): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { expiresAt: now + ttlMs, suggestions });
  if (cache.size <= CACHE_SOFT_CAP) return;
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  while (cache.size > CACHE_SOFT_CAP) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  const clipped = text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text;
  return JSON.parse(clipped) as unknown;
}

type UpstreamResult = { ok: true; suggestions: string[] } | { ok: false };

async function fetchUpstream(
  source: SuggestSource,
  q: string,
  opts: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    maxResults: number;
  },
): Promise<UpstreamResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await opts.fetchImpl(buildSuggestUrl(source, q), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': FETCH_USER_AGENT,
        accept: 'application/json, text/javascript;q=0.9, */*;q=0.8',
      },
    });
    if (!res.ok) {
      await res.body?.cancel?.().catch(() => {});
      return { ok: false };
    }
    const data = await readJson(res);
    const suggestions =
      source === 'google'
        ? parseGooglePayload(data, opts.maxResults)
        : parseBaiduPayload(data, opts.maxResults);
    return { ok: true, suggestions };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按来源拉取联想词。超时、非 200、解析失败都返回空数组，不重试。
 * 成功（含上游合法空列表）写入短 TTL 内存缓存；失败不缓存。
 * 同 key 单飞，避免并发打穿上游。实现仅用 Map / fetch / AbortController，Workers 可用。
 */
export async function fetchSuggestions(
  source: SuggestSource,
  q: string,
  opts: FetchSuggestionsOptions = {},
): Promise<string[]> {
  const query = q.trim();
  if (!query) return [];

  const now = (opts.now ?? Date.now)();
  const cache = opts.cache ?? defaultCache;
  const inflight = opts.inflight ?? defaultInflight;
  const key = suggestCacheKey(source, query);
  const cached = cacheGet(cache, key, now);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const job = (async () => {
    const result = await fetchUpstream(source, query, {
      fetchImpl: opts.fetchImpl ?? fetch,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxResults: opts.maxResults ?? DEFAULT_MAX_RESULTS,
    });
    // 仅缓存成功解析（含上游合法空列表）；超时 / 非 200 / JSON 失败不缓存，避免把故障记 45s。
    if (!result.ok) return [];
    cacheSet(cache, key, result.suggestions, (opts.now ?? Date.now)(), cacheTtlMs);
    return result.suggestions;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, job);
  return job;
}
