import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import {
  looksLikeUrl,
  useSearchSuggest,
  type SuggestFetchFn,
  type SuggestResponse,
} from './useSearchSuggest';

describe('looksLikeUrl', () => {
  it('识别显式协议和裸域名', () => {
    expect(looksLikeUrl('https://example.com')).toBe(true);
    expect(looksLikeUrl('example.com/path')).toBe(true);
    expect(looksLikeUrl('天气')).toBe(false);
    expect(looksLikeUrl('hello world')).toBe(false);
  });
});

describe('useSearchSuggest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(fetchSuggest: SuggestFetchFn, source: 'google' | 'baidu' | null = 'google') {
    const query = ref('');
    const engineId = ref<number | null>(1);
    const suggestSource = ref<'google' | 'baidu' | null>(source);
    const scope = effectScope();
    const api = scope.run(() =>
      useSearchSuggest({ query, engineId, suggestSource, fetchSuggest, debounceMs: 250 }),
    );
    if (!api) throw new Error('effectScope returned nothing');
    return { query, engineId, suggestSource, ...api, stop: () => scope.stop() };
  }

  it('来源为无时不请求', async () => {
    const fetchSuggest = vi.fn();
    const s = setup(fetchSuggest, null);
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchSuggest).not.toHaveBeenCalled();
    expect(s.suggestions.value).toEqual([]);
    s.stop();
  });

  it('输入像网址时不请求', async () => {
    const fetchSuggest = vi.fn();
    const s = setup(fetchSuggest, 'google');
    s.query.value = 'https://example.com';
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(fetchSuggest).not.toHaveBeenCalled();
    s.stop();
  });

  it('防抖：250ms 内连续输入只打最后一次', async () => {
    const fetchSuggest = vi.fn(async (_id: number, q: string): Promise<SuggestResponse> => {
      return { q, suggestions: [`${q}!`] };
    });
    const s = setup(fetchSuggest, 'google');
    s.query.value = 'h';
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    s.query.value = 'he';
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    s.query.value = 'hel';
    await nextTick();
    expect(fetchSuggest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchSuggest).toHaveBeenCalledTimes(1);
    expect(fetchSuggest).toHaveBeenCalledWith(1, 'hel');
    await Promise.resolve();
    expect(s.suggestions.value).toEqual(['hel!']);
    expect(s.open.value).toBe(true);
    s.stop();
  });

  it('丢弃过期响应（用回显的 q）', async () => {
    const resolvers: Array<() => void> = [];
    const fetchSuggest = vi.fn((_id: number, q: string) => {
      return new Promise<SuggestResponse>((resolve) => {
        resolvers.push(() => {
          resolve({ q, suggestions: [q] });
        });
      });
    });
    const s = setup(fetchSuggest, 'google');
    s.query.value = 'a';
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchSuggest).toHaveBeenCalledTimes(1);

    s.query.value = 'ab';
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchSuggest).toHaveBeenCalledTimes(2);

    // 先完成旧请求，再完成新请求：旧结果必须被丢掉。
    resolvers[0]!();
    await Promise.resolve();
    expect(s.suggestions.value).toEqual([]);
    resolvers[1]!();
    await Promise.resolve();
    expect(s.suggestions.value).toEqual(['ab']);
    s.stop();
  });

  it('切换引擎会取消进行中的请求并清空面板', async () => {
    const fetchSuggest = vi.fn(async (_id: number, q: string): Promise<SuggestResponse> => {
      return { q, suggestions: [`${_id}:${q}`] };
    });
    const s = setup(fetchSuggest, 'google');
    s.query.value = 'cat';
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(s.suggestions.value).toEqual(['1:cat']);

    s.engineId.value = 2;
    await nextTick();
    expect(s.suggestions.value).toEqual([]);
    expect(s.open.value).toBe(false);
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(fetchSuggest).toHaveBeenLastCalledWith(2, 'cat');
    expect(s.suggestions.value).toEqual(['2:cat']);
    s.stop();
  });
});
