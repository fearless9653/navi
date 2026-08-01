/** 抓取 service：在 SSRF 防护下取网页并抽元数据。可注入 fetchImpl / lookup，便于测试。 */
import { assertSafeUrl, isBlockedAddress } from './ssrf';
import { extractMetadata, type Metadata } from './metadata';

export type LookupFn = (hostname: string) => Promise<string[]>;

/** 抓取实现的注入签名（路由层依赖它，便于测试/按运行时换 lookup）。 */
export type FetchMetaFn = (url: string) => Promise<Metadata>;

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
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 4;

/**
 * 解析主机名并校验解析出的每个 IP 非私网；返回已校验的 IP 列表。
 * 无 lookup（如 Workers）返回空列表（跳过复核与 IP 固定）。
 */
async function resolveSafeAddrs(hostname: string, lookup?: LookupFn): Promise<string[]> {
  if (!lookup) return [];
  const host = hostname.replace(/^\[/, '').replace(/\]$/, '');
  const addrs = await lookup(host);
  if (addrs.length === 0) throw new Error('dns_no_result');
  for (const ip of addrs) if (isBlockedAddress(ip)) throw new Error('host_blocked_resolved');
  return addrs;
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const t = await res.text();
    return t.length > maxBytes ? t.slice(0, maxBytes) : t;
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
  return new TextDecoder('utf-8').decode(buf);
}

export async function fetchMetadata(
  rawUrl: string,
  opts: FetchMetadataOptions = {},
): Promise<Metadata> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let current = assertSafeUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 逐跳固定连接用的 dispatcher（Node 侧），末尾统一关闭释放连接。
  const dispatchers: { close: () => unknown }[] = [];
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      // 每跳都解析+复核当前主机（初始与重定向目标同样对待），并把连接钉在已校验 IP。
      const addrs = await resolveSafeAddrs(current.hostname, opts.lookup);
      const init: RequestInit = {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'NaviBot/1.0 (+navi)', accept: 'text/html,*/*' },
      };
      if (addrs.length > 0 && opts.makeDispatcher) {
        const dispatcher = opts.makeDispatcher(addrs[0]!);
        dispatchers.push(dispatcher as { close: () => unknown });
        // dispatcher 由入口注入（Node 为 undici Agent）；共享层不引 undici 类型，故此处 cast。
        (init as { dispatcher?: unknown }).dispatcher = dispatcher;
      }
      const res = await fetchImpl(current.toString(), init);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) break; // 无 Location，当作终态处理
        // 重定向目标下一轮循环开头会再解析+复核+固定。
        current = assertSafeUrl(new URL(loc, current.toString()).toString());
        continue;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('text/html')) {
        return {
          title: null,
          description: null,
          faviconUrl: new URL('/favicon.ico', current.toString()).toString(),
        };
      }
      const html = await readCapped(res, maxBytes);
      return extractMetadata(html, current.toString());
    }
    throw new Error('too_many_redirects');
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
