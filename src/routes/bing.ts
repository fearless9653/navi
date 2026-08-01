import { Hono } from 'hono';

interface BingImageArchiveResponse {
  images: Array<{
    url: string;
    title: string;
    copyright: string;
  }>;
}

const BING_API_URL = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时
const FETCH_TIMEOUT_MS = 5000;

let cachedWallpaper: { url: string; fetchedAt: number } | null = null;
// 单飞：缓存未命中时并发请求共享同一次上游抓取，避免缓存击穿（无鉴权端点尤需）。
let inFlight: Promise<string> | null = null;

async function fetchBingWallpaper(): Promise<string> {
  try {
    const response = await fetch(BING_API_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Bing API returned ${response.status}`);
    const data = (await response.json()) as BingImageArchiveResponse;
    const image = data.images?.[0];
    if (!image) throw new Error('No images in Bing API response');
    const fullUrl = `https://www.bing.com${image.url}`;
    cachedWallpaper = { url: fullUrl, fetchedAt: Date.now() };
    return fullUrl;
  } finally {
    inFlight = null;
  }
}

/** Bing 壁纸路由（无需登录，公共资源）。 */
export function bingRoutes() {
  const app = new Hono();

  app.get('/wallpaper', async (c) => {
    if (cachedWallpaper && Date.now() - cachedWallpaper.fetchedAt < CACHE_DURATION) {
      return c.json({ url: cachedWallpaper.url });
    }
    try {
      const url = await (inFlight ??= fetchBingWallpaper());
      return c.json({ url });
    } catch (error) {
      console.error('Failed to fetch Bing wallpaper:', error);
      // 有过期缓存则降级使用。
      if (cachedWallpaper) return c.json({ url: cachedWallpaper.url });
      return c.json({ error: 'Failed to fetch Bing wallpaper' }, 500);
    }
  });

  return app;
}
