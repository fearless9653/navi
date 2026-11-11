/** 搜索建议代理：仅请求内置白名单上游（Google / Baidu），失败降级为空列表。 */
import { FETCH_USER_AGENT } from './fetcher';
import { resolveFetch } from './runtimeFetch';
import type { SuggestSource } from './engines';

export type { SuggestSource };

const GOOGLE_ENDPOINT = 'https://suggestqueries.google.com/complete/search';
const BAIDU_ENDPOINT = 'https://www.baidu.com/sugrec';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_CACHE_TTL_MS = 45_000;
const CACHE_SOFT_CAP = 256;
const MAX_BODY_CHARS = 256 * 1024;
const MAX_LOG_STRING = 200;

/** Workers Logs 中可过滤的固定组件名。 */
export const SUGGEST_LOG_COMPONENT = 'navi.suggest';

export type SuggestLogEvent = 'unexpected_shape' | 'upstream_error';

/** 禁止写入日志的字段，防止调用方误传查询词 / URL / 正文 / cookie。 */
const LOG_FIELD_DENYLIST = new Set([
  'q',
  'query',
  'url',
  'href',
  'body',
  'text',
  'cookie',
  'cookies',
  'authorization',
  'set-cookie',
]);

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
  /** 可选关联标识，例如 CF-Ray；不得传入查询词。 */
  requestId?: string;
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

type ParseResult = { shape: 'expected'; suggestions: string[] } | { shape: 'unexpected' };

function parseGooglePayload(data: unknown, maxResults: number): ParseResult {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return { shape: 'unexpected' };
  return { shape: 'expected', suggestions: normalizeSuggestions(data[1], maxResults) };
}

function parseBaiduPayload(data: unknown, maxResults: number): ParseResult {
  if (typeof data !== 'object' || data === null) return { shape: 'unexpected' };
  const group = (data as { g?: unknown }).g;
  if (!Array.isArray(group)) return { shape: 'unexpected' };
  const terms = group.map((item) =>
    typeof item === 'object' && item !== null ? (item as { q?: unknown }).q : undefined,
  );
  return { shape: 'expected', suggestions: normalizeSuggestions(terms, maxResults) };
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

/** 清洗异常 message：去掉可能含查询词的 URL / 查询参数，避免写入日志。 */
export function sanitizeSuggestErrorMessage(message: unknown): string {
  if (typeof message !== 'string' || !message) return '';
  let s = message.replace(/https?:\/\/[^\s)'"<>\\]+/gi, '[url]');
  s = s.replace(/www\.[^\s)'"<>\\]+/gi, '[host]');
  s = s.replace(/[?&](?:q|wd|query|hl|gl|ie|prod|json|client)=[^&\s)'"<>\\]*/gi, '');
  s = s.replace(/\S*suggestqueries\S*/gi, '[host]');
  s = s.replace(/\S*baidu\.com\S*/gi, '[host]');
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_LOG_STRING);
}

function errorNameOf(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'name' in err &&
    typeof (err as { name: unknown }).name === 'string'
  ) {
    return (err as { name: string }).name.slice(0, 80) || 'Error';
  }
  return 'Error';
}

function rawErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return typeof err === 'string' ? err : '';
}

function errorMessageOf(err: unknown): string {
  return sanitizeSuggestErrorMessage(rawErrorMessage(err) || err);
}

/** 仅把 Illegal invocation / 错误 this 标为 runtime，不把所有 TypeError 当成运行时错误。 */
function classifyFetchThrow(err: unknown): 'abort' | 'runtime' | 'network' {
  if (errorNameOf(err) === 'AbortError') return 'abort';
  const raw = rawErrorMessage(err);
  if (/illegal invocation/i.test(raw) || /incorrect [`']?this[`']? reference/i.test(raw)) {
    return 'runtime';
  }
  return 'network';
}

function safeContentType(res: Response): string | undefined {
  const raw = res.headers.get('content-type');
  if (!raw) return undefined;
  const mime = raw.split(';')[0]?.trim() ?? '';
  const clipped = mime.slice(0, 80);
  return clipped || undefined;
}

function looksLikeHtml(contentType: string | undefined, text: string): boolean {
  if (contentType && /html/i.test(contentType)) return true;
  return /^\s*</.test(text);
}

export interface SuggestLogFields {
  source?: SuggestSource | null;
  requestId?: string;
  status?: number;
  durationMs?: number;
  contentType?: string;
  count?: number;
  reason?: 'non_2xx' | 'invalid_json' | 'html' | 'abort' | 'network' | 'runtime';
  errorName?: string;
  errorMessage?: string;
}

/** 仅记录关键 warn；失败时吞掉异常，不得影响建议请求结果。 */
export function logSuggest(event: SuggestLogEvent, fields: SuggestLogFields = {}): void {
  try {
    const payload: Record<string, unknown> = { component: SUGGEST_LOG_COMPONENT, event };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (LOG_FIELD_DENYLIST.has(key)) continue;
      payload[key] = value;
    }
    console.warn(payload);
  } catch {
    // 日志不得改变请求结果
  }
}

type UpstreamResult = { ok: true; suggestions: string[] } | { ok: false };

async function fetchUpstream(
  source: SuggestSource,
  q: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs: number;
    maxResults: number;
    requestId?: string;
  },
): Promise<UpstreamResult> {
  const started = Date.now();
  const base = { source, requestId: opts.requestId };
  const durationMs = () => Math.max(0, Date.now() - started);
  const doFetch = resolveFetch(opts.fetchImpl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await doFetch(buildSuggestUrl(source, q), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': FETCH_USER_AGENT,
        accept: 'application/json, text/javascript;q=0.9, */*;q=0.8',
      },
    });
    const status = res.status;
    const contentType = safeContentType(res);

    if (!res.ok) {
      await res.body?.cancel?.().catch(() => {});
      logSuggest('upstream_error', {
        ...base,
        status,
        contentType,
        durationMs: durationMs(),
        reason: 'non_2xx',
      });
      return { ok: false };
    }

    let text: string;
    try {
      const raw = await res.text();
      text = raw.length > MAX_BODY_CHARS ? raw.slice(0, MAX_BODY_CHARS) : raw;
    } catch (err) {
      logSuggest('upstream_error', {
        ...base,
        status,
        contentType,
        durationMs: durationMs(),
        reason: 'network',
        errorName: errorNameOf(err),
        errorMessage: errorMessageOf(err),
      });
      return { ok: false };
    }

    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch (err) {
      logSuggest('upstream_error', {
        ...base,
        status,
        contentType,
        durationMs: durationMs(),
        reason: looksLikeHtml(contentType, text) ? 'html' : 'invalid_json',
        errorName: errorNameOf(err),
        errorMessage: errorMessageOf(err),
      });
      return { ok: false };
    }

    const parsed =
      source === 'google'
        ? parseGooglePayload(data, opts.maxResults)
        : parseBaiduPayload(data, opts.maxResults);
    if (parsed.shape === 'unexpected') {
      logSuggest('unexpected_shape', {
        ...base,
        status,
        contentType,
        durationMs: durationMs(),
        count: 0,
      });
      return { ok: true, suggestions: [] };
    }
    return { ok: true, suggestions: parsed.suggestions };
  } catch (err) {
    logSuggest('upstream_error', {
      ...base,
      durationMs: durationMs(),
      reason: classifyFetchThrow(err),
      errorName: errorNameOf(err),
      errorMessage: errorMessageOf(err),
    });
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
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxResults: opts.maxResults ?? DEFAULT_MAX_RESULTS,
      requestId: opts.requestId,
    });
    // 仅缓存成功解析（含上游合法空列表）；超时 / 非 200 / JSON 失败不缓存，避免把故障记 45s。
    // unexpected_shape 沿用原行为：视为成功空列表并缓存。
    if (!result.ok) return [];
    cacheSet(cache, key, result.suggestions, (opts.now ?? Date.now)(), cacheTtlMs);
    return result.suggestions;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, job);
  return job;
}
