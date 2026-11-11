import { afterEach, describe, expect, it, vi } from 'vitest';
import { FETCH_USER_AGENT } from '@/services/fetcher';
import { ILLEGAL_INVOCATION, installStrictGlobalFetch } from '../helpers/strictFetch';
import {
  buildSuggestUrl,
  fetchSuggestions,
  logSuggest,
  normalizeSuggestions,
  sanitizeSuggestErrorMessage,
  SUGGEST_LOG_COMPONENT,
  type SuggestCache,
} from '@/services/suggest';

function jsonResponse(
  body: unknown,
  status = 200,
  contentType = 'application/json; charset=utf-8',
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

function textResponse(body: string, status = 200, contentType = 'text/plain'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

const LEAK_QUERY = '天地secret-query';
const LEAK_URL = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(LEAK_QUERY)}`;
const LEAK_BODY = '<html>SECRET_BODY_天地</html>';

function serializeCalls(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls
    .map((args) =>
      args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
    )
    .join('\n');
}

function payloadsOf(spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return spy.mock.calls.map((args) => args[0] as Record<string, unknown>);
}

function assertNoLeakage(...spies: { mock: { calls: unknown[][] } }[]): void {
  const text = spies.map(serializeCalls).join('\n');
  expect(text).not.toContain(LEAK_QUERY);
  expect(text).not.toContain('secret-query');
  expect(text).not.toContain(LEAK_URL);
  expect(text).not.toContain('suggestqueries.google.com');
  expect(text).not.toContain('www.baidu.com');
  expect(text).not.toContain(LEAK_BODY);
  expect(text).not.toContain('SECRET_BODY');
  expect(text).not.toContain('cookie');
}

describe('buildSuggestUrl', () => {
  it('Google 使用 client=firefox 且不含 output=firefox', () => {
    const url = new URL(buildSuggestUrl('google', '天气'));
    expect(url.origin + url.pathname).toBe('https://suggestqueries.google.com/complete/search');
    expect(url.searchParams.get('client')).toBe('firefox');
    expect(url.searchParams.get('q')).toBe('天气');
    expect(url.searchParams.get('hl')).toBe('zh-CN');
    expect(url.searchParams.get('gl')).toBe('cn');
    expect(url.searchParams.has('output')).toBe(false);
    expect(url.searchParams.has('cb')).toBe(false);
    expect(url.searchParams.has('callback')).toBe(false);
  });

  it('Baidu 使用 prod=pc 且不含 callback', () => {
    const url = new URL(buildSuggestUrl('baidu', '天气'));
    expect(url.origin + url.pathname).toBe('https://www.baidu.com/sugrec');
    expect(url.searchParams.get('prod')).toBe('pc');
    expect(url.searchParams.get('ie')).toBe('utf-8');
    expect(url.searchParams.get('json')).toBe('1');
    expect(url.searchParams.get('wd')).toBe('天气');
    expect(url.searchParams.has('cb')).toBe(false);
    expect(url.searchParams.has('callback')).toBe(false);
  });
});

describe('normalizeSuggestions', () => {
  it('过滤非字符串和空白，保持原序并截到上限', () => {
    expect(normalizeSuggestions(['a', '  ', 1, null, 'b', 'c'] as unknown[], 2)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('fetchSuggestions', () => {
  it('解析 Google firefox 形 payload，并带浏览器 UA', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain('client=firefox');
      expect(url).not.toContain('output=firefox');
      expect(init?.headers && (init.headers as Record<string, string>)['user-agent']).toBe(
        FETCH_USER_AGENT,
      );
      return jsonResponse(['weather', ['weather today', 'weather tomorrow', '']]);
    });
    const cache: SuggestCache = new Map();
    const terms = await fetchSuggestions('google', 'weather', { fetchImpl, cache });
    expect(terms).toEqual(['weather today', 'weather tomorrow']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('解析 Baidu g[].q', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      expect(url).toContain('prod=pc');
      expect(url).toContain('wd=');
      return jsonResponse({
        q: '天气',
        g: [{ q: '天气预报' }, { q: '天气查询' }, { sa: 'no-term' }],
      });
    });
    const terms = await fetchSuggestions('baidu', '天气', { fetchImpl, cache: new Map() });
    expect(terms).toEqual(['天气预报', '天气查询']);
  });

  it('空 / 畸形 payload 返回空列表', async () => {
    const payloads: unknown[] = [null, {}, { g: 'nope' }, ['only-query'], 'oops', { g: [] }];
    for (const body of payloads) {
      const fetchImpl = vi.fn(async () =>
        typeof body === 'string' ? new Response(body, { status: 200 }) : jsonResponse(body),
      );
      const terms = await fetchSuggestions('google', 'q', { fetchImpl, cache: new Map() });
      expect(terms).toEqual([]);
    }
  });

  it('非 200 返回空列表且不抛错', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(['q', ['nope']], 400));
    await expect(fetchSuggestions('google', 'q', { fetchImpl, cache: new Map() })).resolves.toEqual(
      [],
    );
  });

  it('空查询不发请求', async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchSuggestions('google', '   ', { fetchImpl, cache: new Map() }),
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('成功结果走短缓存，失败不缓存', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(['q', ['one']]));
    const cache: SuggestCache = new Map();
    const now = vi.fn(() => 1_000);
    const first = await fetchSuggestions('google', 'q', { fetchImpl, cache, now });
    const second = await fetchSuggestions('google', 'q', { fetchImpl, cache, now });
    expect(first).toEqual(['one']);
    expect(second).toEqual(['one']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const failing = vi.fn(async () => jsonResponse({}, 503));
    const failCache: SuggestCache = new Map();
    await expect(
      fetchSuggestions('baidu', 'q', { fetchImpl: failing, cache: failCache, now }),
    ).resolves.toEqual([]);
    expect(failCache.size).toBe(0);
    await fetchSuggestions('baidu', 'q', { fetchImpl: failing, cache: failCache, now });
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe('suggest logging', () => {
  let info: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockConsole() {
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    return { info, warn };
  }

  it('sanitizeSuggestErrorMessage 去掉含查询词的 URL', () => {
    const cleaned = sanitizeSuggestErrorMessage(`fetch failed: ${LEAK_URL} cookie=abc`);
    expect(cleaned).toContain('[url]');
    expect(cleaned).not.toContain(LEAK_QUERY);
    expect(cleaned).not.toContain('suggestqueries.google.com');
    expect(cleaned).not.toContain(encodeURIComponent(LEAK_QUERY));
  });

  it('成功解析不写 info/warn 日志，且不含查询 / URL / 正文', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(['ignored', ['one', 'two']], 200, 'text/javascript; charset=UTF-8'),
    );
    const terms = await fetchSuggestions('google', LEAK_QUERY, {
      fetchImpl,
      cache: new Map(),
      requestId: 'ray-test-1',
    });
    expect(terms).toEqual(['one', 'two']);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    assertNoLeakage(info, warn);
  });

  it('合法空列表不打日志，但仍缓存', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () => jsonResponse(['q', []]));
    const cache: SuggestCache = new Map();
    const now = vi.fn(() => 1_000);
    await expect(
      fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache, now }),
    ).resolves.toEqual([]);
    expect(cache.size).toBe(1);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    await expect(
      fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache, now }),
    ).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('合法 JSON 但结构不符记录 unexpected_shape，仍按成功空列表缓存', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () => jsonResponse({ g: 'nope' }));
    const cache: SuggestCache = new Map();
    const now = vi.fn(() => 1_000);
    await expect(
      fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache, now }),
    ).resolves.toEqual([]);
    expect(cache.size).toBe(1);
    expect(info).not.toHaveBeenCalled();
    expect(payloadsOf(warn).map((p) => p.event)).toEqual(['unexpected_shape']);
    expect(payloadsOf(warn)[0]).toMatchObject({
      component: SUGGEST_LOG_COMPONENT,
      event: 'unexpected_shape',
      source: 'google',
      status: 200,
      count: 0,
    });
    warn.mockClear();
    await fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache, now });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    assertNoLeakage(info, warn);
  });

  it('上游 HTML 记录 upstream_error reason=html，且不缓存', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () => textResponse(LEAK_BODY, 200, 'text/html; charset=utf-8'));
    const cache: SuggestCache = new Map();
    const now = vi.fn(() => 1_000);
    await expect(fetchSuggestions('baidu', LEAK_QUERY, { fetchImpl, cache, now })).resolves.toEqual(
      [],
    );
    expect(cache.size).toBe(0);
    expect(info).not.toHaveBeenCalled();
    expect(payloadsOf(warn).map((p) => p.event)).toEqual(['upstream_error']);
    expect(payloadsOf(warn)[0]).toMatchObject({
      event: 'upstream_error',
      source: 'baidu',
      status: 200,
      contentType: 'text/html',
      reason: 'html',
    });
    await fetchSuggestions('baidu', LEAK_QUERY, { fetchImpl, cache, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    assertNoLeakage(info, warn);
  });

  it('非 2xx 记录 upstream_error reason=non_2xx，且不缓存', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () => jsonResponse({ error: LEAK_BODY }, 403));
    const cache: SuggestCache = new Map();
    const now = vi.fn(() => 1_000);
    await expect(
      fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache, now }),
    ).resolves.toEqual([]);
    expect(cache.size).toBe(0);
    expect(payloadsOf(warn)[0]).toMatchObject({
      event: 'upstream_error',
      reason: 'non_2xx',
      status: 403,
      source: 'google',
    });
    await fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    assertNoLeakage(info, warn);
  });

  it('无效 JSON 记录 upstream_error reason=invalid_json，且不缓存', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () => textResponse('not-json{', 200, 'application/json'));
    const cache: SuggestCache = new Map();
    await expect(fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache })).resolves.toEqual([]);
    expect(cache.size).toBe(0);
    expect(payloadsOf(warn)[0]).toMatchObject({
      event: 'upstream_error',
      reason: 'invalid_json',
      status: 200,
    });
    expect((payloadsOf(warn)[0] as { errorName?: string }).errorName).toBe('SyntaxError');
    assertNoLeakage(info, warn);
  });

  it('网络异常清洗 message 后记录 reason=network，且不缓存', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`Failed to fetch: ${LEAK_URL}`);
    });
    const cache: SuggestCache = new Map();
    await expect(fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache })).resolves.toEqual([]);
    expect(cache.size).toBe(0);
    const errorLog = payloadsOf(warn)[0]!;
    expect(errorLog).toMatchObject({
      event: 'upstream_error',
      reason: 'network',
      errorName: 'TypeError',
      source: 'google',
    });
    expect(String(errorLog.errorMessage)).toContain('[url]');
    expect(String(errorLog.errorMessage)).not.toContain(LEAK_QUERY);
    expect(String(errorLog.errorMessage)).not.toContain('suggestqueries.google.com');
    assertNoLeakage(info, warn);
  });

  it('Illegal invocation 记录 reason=runtime，不误标为 network', async () => {
    mockConsole();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(ILLEGAL_INVOCATION);
    });
    const cache: SuggestCache = new Map();
    await expect(fetchSuggestions('baidu', LEAK_QUERY, { fetchImpl, cache })).resolves.toEqual([]);
    expect(cache.size).toBe(0);
    expect(payloadsOf(warn)[0]).toMatchObject({
      event: 'upstream_error',
      reason: 'runtime',
      errorName: 'TypeError',
      source: 'baidu',
    });
    assertNoLeakage(info, warn);
  });

  it('空查询不发请求也不打日志', async () => {
    mockConsole();
    const fetchImpl = vi.fn();
    await fetchSuggestions('google', '   ', {
      fetchImpl,
      cache: new Map(),
      requestId: 'ray-empty',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('日志抛错不影响请求结果', async () => {
    mockConsole();
    warn.mockImplementation(() => {
      throw new Error('logger down');
    });
    const fetchImpl = vi.fn(async () => jsonResponse({ g: 'nope' }));
    await expect(
      fetchSuggestions('google', LEAK_QUERY, { fetchImpl, cache: new Map() }),
    ).resolves.toEqual([]);
  });

  it('logSuggest 丢弃敏感字段且自身异常被吞掉', () => {
    mockConsole();
    logSuggest('unexpected_shape', {
      source: 'google',
      count: 0,
      // 即便误传也不得出现在日志中
      ...({ q: LEAK_QUERY, url: LEAK_URL, body: LEAK_BODY, cookie: 'secret' } as object),
    } as Parameters<typeof logSuggest>[1]);
    expect(payloadsOf(warn)[0]).toEqual({
      component: SUGGEST_LOG_COMPONENT,
      event: 'unexpected_shape',
      source: 'google',
      count: 0,
    });
    assertNoLeakage(info, warn);

    warn.mockImplementation(() => {
      throw new Error('console broken');
    });
    expect(() => logSuggest('upstream_error', { reason: 'network' })).not.toThrow();
  });
});

describe('suggest fetch this binding', () => {
  const restores: Array<() => void> = [];
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  function googlePayload() {
    return jsonResponse(['q', ['one']]);
  }
  function baiduPayload() {
    return jsonResponse({ g: [{ q: 'one' }] });
  }

  it('默认全局 fetch 路径：google / baidu 都以 globalThis 为接收者', async () => {
    const urls: string[] = [];
    restores.push(
      installStrictGlobalFetch(async (input) => {
        urls.push(String(input));
        return String(input).includes('baidu.com') ? baiduPayload() : googlePayload();
      }),
    );
    await expect(fetchSuggestions('google', '天气', { cache: new Map() })).resolves.toEqual([
      'one',
    ]);
    await expect(fetchSuggestions('baidu', '天气', { cache: new Map() })).resolves.toEqual(['one']);
    expect(urls.some((u) => u.includes('suggestqueries.google.com'))).toBe(true);
    expect(urls.some((u) => u.includes('www.baidu.com'))).toBe(true);
  });

  it('显式注入 globalThis.fetch 时同样保持正确接收者', async () => {
    restores.push(installStrictGlobalFetch(async () => googlePayload()));
    await expect(
      fetchSuggestions('google', '天气', { fetchImpl: globalThis.fetch, cache: new Map() }),
    ).resolves.toEqual(['one']);
  });

  it('普通注入函数保持裸调用，不会被 bind 到 globalThis', async () => {
    const seen: unknown[] = [];
    const fetchImpl = async function (this: unknown) {
      seen.push(this);
      return googlePayload();
    };
    await expect(
      fetchSuggestions('google', '天气', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        cache: new Map(),
      }),
    ).resolves.toEqual(['one']);
    expect(seen).toEqual([undefined]);
  });
});
