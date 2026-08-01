import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBingWallpaper } from './bingWallpaper';

const CACHE_KEY = 'bing_wallpaper_cache';

describe('fetchBingWallpaper', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('缓存有效时直接返回缓存、不请求后端', async () => {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ url: 'https://cached.jpg', fetchedAt: Date.now() }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await fetchBingWallpaper()).toBe('https://cached.jpg');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('无缓存时请求后端并写入缓存', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://new.jpg' }), { status: 200 }),
    );
    expect(await fetchBingWallpaper()).toBe('https://new.jpg');
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY)!) as { url: string };
    expect(cached.url).toBe('https://new.jpg');
  });

  it('后端失败但有过期缓存时降级用旧值', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ url: 'https://stale.jpg', fetchedAt: 0 }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    expect(await fetchBingWallpaper()).toBe('https://stale.jpg');
  });

  it('后端失败且无缓存时抛错', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    await expect(fetchBingWallpaper()).rejects.toThrow();
  });
});
