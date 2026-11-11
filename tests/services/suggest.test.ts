import { describe, expect, it, vi } from 'vitest';
import { FETCH_USER_AGENT } from '@/services/fetcher';
import {
  buildSuggestUrl,
  fetchSuggestions,
  normalizeSuggestions,
  type SuggestCache,
} from '@/services/suggest';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
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
    await expect(
      fetchSuggestions('google', 'q', { fetchImpl, cache: new Map() }),
    ).resolves.toEqual([]);
  });

  it('空查询不发请求', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchSuggestions('google', '   ', { fetchImpl, cache: new Map() })).resolves.toEqual(
      [],
    );
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
