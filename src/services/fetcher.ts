/** 抓取 service：在 SSRF 防护下取网页并抽元数据。可注入 fetchImpl / lookup，便于测试。 */
import { decodeHtmlBytes } from './charset';
import { assertSafeUrl, isBlockedAddress } from './ssrf';
import { extractMetadata, type Metadata } from './metadata';

export type LookupFn = (hostname: string) => Promise<string[]>;

/** 单次抓取可由路由传入的请求上下文（目前只透传用户的 Accept-Language）。 */
export interface FetchMetaRequest {
  acceptLanguage?: string;
}

/** 抓取实现的注入签名（路由层依赖它，便于测试/按运行时换 lookup）。 */
export type FetchMetaFn = (url: string, req?: FetchMetaRequest) => Promise<Metadata>;

export interface FetchMetadataOptions {
  fetchImpl?: typeof fetch;
  /** 解析主机名为 IP 列表做私网复核；不传则跳过（如 Workers）。 */
  lookup?: LookupFn;
  /**
   * 为「已校验 IP」构造一个把连接钉死在该 IP 的 dispatcher（Node 入口注入）。
   * 用于防 DNS rebinding：校验与实际连接必须用同一个 IP，否则 undici 会二次独立解析。
   * 返回值透传给 fetch 的 `dispatcher` 选项；不传则不钉（如 Workers，依赖平台出口）。
   */
  makeDispatcher?: (ip: string) => unknown;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** 透传来自用户请求的 Accept-Language；缺省不附带该头。 */
  acceptLanguage?: string;
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 4;
const MAX_ATTEMPTS = 2;
const ACCEPT_LANGUAGE_MAX = 200;
/** 常见浏览器 UA，减少目标站把抓取当成机器人拦截。 */
export const FETCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const FATAL_MESSAGES = new Set([
  'invalid_url',
  'scheme_not_allowed',
  'credentials_not_allowed',
  'host_blocked',
  'host_blocked_resolved',
  'dns_no_result',
  'too_many_redirects',
]);

/**
 * 解析主机名并校验解析出的每个 IP 非私网；返回已校验的 IP 列表（IPv4 在前）。
 * 无 lookup（如 Workers）返回空列表（跳过复核与 IP 固定）。
 */
async function resolveSafeAddrs(hostname: string, lookup?: LookupFn): Promise<string[]> {
  if (!lookup) return [];
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '');
  const addrs = await lookup(host);
  if (addrs.length === 0) throw new Error('dns_no_result');
  for (const ip of addrs) if (isBlockedAddress(ip)) throw new Error('host_blocked_resolved');
  const v4 = addrs.filter((ip) => !ip.includes(':'));
  const v6 = addrs.filter((ip) => ip.includes(':'));
  return [...v4, ...v6];
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > maxBytes ? buf.subarray(0, maxBytes) : buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  const cap = Math.min(total, maxBytes);
  const buf = new Uint8Array(cap);
  let off = 0;
  for (const c of chunks) {
    if (off >= cap) break;
    const take = Math.min(c.length, cap - off);
    buf.set(c.subarray(0, take), off);
    off += take;
  }
  return buf;
}

function fallbackMeta(current: URL): Metadata {
  try {
    return {
      title: null,
      description: null,
      faviconUrl: new URL('/favicon.ico', current.toString()).toString(),
    };
  } catch {
    return { title: null, description: null, faviconUrl: null };
  }
}

function isClearlyNotHtml(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (!ct) return false;
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) return false;
  if (ct.includes('application/json') || ct.includes('application/pdf')) return true;
  if (ct.includes('application/xml') || ct.includes('text/xml')) return true;
  if (ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('video/')) return true;
  if (ct.startsWith('font/') || ct.includes('application/octet-stream')) return false;
  if (ct.startsWith('text/')) return false;
  return false;
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 512));
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<title[\s>]|<meta[\s>]/i.test(head);
}

function shouldParseHtml(contentType: string, bytes: Uint8Array): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) return true;
  if (isClearlyNotHtml(ct)) return false;
  return looksLikeHtml(bytes);
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

function isRetryable(e: unknown): boolean {
  if (isAbortError(e)) return false;
  if (e instanceof Error && FATAL_MESSAGES.has(e.message)) return false;
  return true;
}

function requestHeaders(acceptLanguage?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': FETCH_USER_AGENT,
    accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  };
  const lang = acceptLanguage?.trim();
  if (lang) headers['accept-language'] = lang.slice(0, ACCEPT_LANGUAGE_MAX);
  return headers;
}

export async function fetchMetadata(
  rawUrl: string,
  opts: FetchMetadataOptions = {},
): Promise<Metadata> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const headers = requestHeaders(opts.acceptLanguage);

  const start = assertSafeUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 逐跳固定连接用的 dispatcher（Node 侧），末尾统一关闭释放连接。
  const dispatchers: { close: () => unknown }[] = [];
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await runFetch(start, {
          fetchImpl,
          lookup: opts.lookup,
          makeDispatcher: opts.makeDispatcher,
          maxBytes,
          maxRedirects,
          headers,
          signal: controller.signal,
          dispatchers,
        });
      } catch (e) {
        lastErr = e;
        if (attempt + 1 >= MAX_ATTEMPTS || controller.signal.aborted || !isRetryable(e)) throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('fetch_failed');
  } finally {
    clearTimeout(timer);
    for (const d of dispatchers) {
      try {
        await d.close();
      } catch {
        /* 关闭失败无副作用，忽略 */
      }
    }
  }
}

async function runFetch(
  start: URL,
  ctx: {
    fetchImpl: typeof fetch;
    lookup?: LookupFn;
    makeDispatcher?: (ip: string) => unknown;
    maxBytes: number;
    maxRedirects: number;
    headers: Record<string, string>;
    signal: AbortSignal;
    dispatchers: { close: () => unknown }[];
  },
): Promise<Metadata> {
  let current = start;
  for (let hop = 0; hop <= ctx.maxRedirects; hop++) {
    // 每跳都解析+复核当前主机（初始与重定向目标同样对待），并把连接钉在已校验 IP。
    const addrs = await resolveSafeAddrs(current.hostname, ctx.lookup);
    const res = await fetchHop(current, addrs, ctx);

    if (REDIRECT_STATUS.has(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) return fallbackMeta(current);
      // 重定向目标下一轮循环开头会再解析+复核+固定。
      current = assertSafeUrl(new URL(loc, current.toString()).toString());
      continue;
    }

    if (res.status === 408 || res.status === 429 || res.status >= 500) {
      await res.body?.cancel?.().catch(() => {});
      throw new Error('http_upstream');
    }
    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel?.().catch(() => {});
      return fallbackMeta(current);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (isClearlyNotHtml(contentType)) return fallbackMeta(current);
    const bytes = await readCapped(res, ctx.maxBytes);
    if (!shouldParseHtml(contentType, bytes)) return fallbackMeta(current);
    return extractMetadata(decodeHtmlBytes(bytes, contentType), current.toString());
  }
  throw new Error('too_many_redirects');
}

async function fetchHop(
  current: URL,
  addrs: string[],
  ctx: {
    fetchImpl: typeof fetch;
    makeDispatcher?: (ip: string) => unknown;
    headers: Record<string, string>;
    signal: AbortSignal;
    dispatchers: { close: () => unknown }[];
  },
): Promise<Response> {
  const candidates = addrs.length > 0 && ctx.makeDispatcher ? addrs : [undefined];
  let lastErr: unknown;
  for (const ip of candidates) {
    if (ctx.signal.aborted) {
      if (lastErr instanceof Error) throw lastErr;
      const abortErr = new Error('This operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const init: RequestInit = {
      redirect: 'manual',
      signal: ctx.signal,
      headers: ctx.headers,
    };
    if (ip && ctx.makeDispatcher) {
      const dispatcher = ctx.makeDispatcher(ip);
      ctx.dispatchers.push(dispatcher as { close: () => unknown });
      // dispatcher 由入口注入（Node 为 undici Agent）；共享层不引 undici 类型，故此处 cast。
      (init as { dispatcher?: unknown }).dispatcher = dispatcher;
    }
    try {
      return await ctx.fetchImpl(current.toString(), init);
    } catch (e) {
      lastErr = e;
      if (isAbortError(e) || !ip || ip === candidates[candidates.length - 1]) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch_failed');
}
