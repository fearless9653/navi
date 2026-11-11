import { onUnmounted, ref, watch, type Ref } from 'vue';
import { api } from '@/api/client';
import type { SuggestSource } from '@/api/types';

export interface SuggestResponse {
  q: string;
  suggestions: string[];
}

export type SuggestFetchFn = (engineId: number, q: string) => Promise<SuggestResponse>;

export interface UseSearchSuggestOptions {
  query: Ref<string>;
  engineId: Ref<number | null>;
  suggestSource: Ref<SuggestSource | null | undefined>;
  debounceMs?: number;
  /** 注入以便单测，默认走 GET /api/engines/:id/suggest?q= */
  fetchSuggest?: SuggestFetchFn;
}

/** 输入是否已是网址：显式 http(s):// 或裸域名（含点、无空格，可带端口/路径）。 */
export function looksLikeUrl(s: string): boolean {
  if (/^https?:\/\//i.test(s)) return true;
  return !/\s/.test(s) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s);
}

async function defaultFetchSuggest(engineId: number, q: string): Promise<SuggestResponse> {
  return api.get<SuggestResponse>(`/engines/${engineId}/suggest?q=${encodeURIComponent(q)}`);
}

/**
 * 首页搜索框联想：按当前引擎的来源请求后端代理，防抖并丢弃过期响应。
 * 来源为无、输入为空或看起来像网址时不发请求。
 */
export function useSearchSuggest(opts: UseSearchSuggestOptions): {
  suggestions: Ref<string[]>;
  open: Ref<boolean>;
  activeIndex: Ref<number>;
  close: () => void;
  clearPanel: () => void;
  moveActive: (delta: number) => void;
  takeActive: () => string | null;
} {
  const suggestions = ref<string[]>([]);
  const open = ref(false);
  const activeIndex = ref(-1);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  const debounceMs = opts.debounceMs ?? 250;
  const fetchSuggest = opts.fetchSuggest ?? defaultFetchSuggest;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function clearPanel(): void {
    suggestions.value = [];
    open.value = false;
    activeIndex.value = -1;
  }

  function close(): void {
    open.value = false;
    activeIndex.value = -1;
  }

  function invalidate(): void {
    seq += 1;
    clearTimer();
  }

  function shouldRequest(
    id: number | null,
    source: SuggestSource | null | undefined,
    q: string,
  ): id is number {
    return (
      id != null &&
      id > 0 &&
      (source === 'google' || source === 'baidu') &&
      q.length > 0 &&
      !looksLikeUrl(q)
    );
  }

  async function request(engineId: number, q: string, token: number): Promise<void> {
    try {
      const res = await fetchSuggest(engineId, q);
      if (token !== seq) return;
      if (res.q !== q) return;
      suggestions.value = Array.isArray(res.suggestions) ? res.suggestions : [];
      open.value = suggestions.value.length > 0;
      activeIndex.value = -1;
    } catch {
      if (token !== seq) return;
      clearPanel();
    }
  }

  function schedule(): void {
    clearTimer();
    const q = opts.query.value.trim();
    const id = opts.engineId.value;
    const source = opts.suggestSource.value;
    if (!shouldRequest(id, source, q)) {
      invalidate();
      clearPanel();
      return;
    }
    const token = ++seq;
    timer = setTimeout(() => {
      timer = null;
      void request(id, q, token);
    }, debounceMs);
  }

  watch(
    () => opts.query.value,
    () => {
      schedule();
    },
    { immediate: true },
  );

  watch([() => opts.engineId.value, () => opts.suggestSource.value], () => {
    invalidate();
    clearPanel();
    schedule();
  });

  onUnmounted(() => {
    invalidate();
  });

  function moveActive(delta: number): void {
    if (!open.value || suggestions.value.length === 0) return;
    const len = suggestions.value.length;
    if (activeIndex.value < 0) {
      activeIndex.value = delta > 0 ? 0 : len - 1;
      return;
    }
    activeIndex.value = (activeIndex.value + delta + len) % len;
  }

  function takeActive(): string | null {
    if (!open.value || activeIndex.value < 0) return null;
    return suggestions.value[activeIndex.value] ?? null;
  }

  return { suggestions, open, activeIndex, close, clearPanel, moveActive, takeActive };
}
