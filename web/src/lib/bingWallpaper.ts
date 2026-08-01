interface BingWallpaper {
  url: string;
  fetchedAt: number;
}

interface BingAPIResponse {
  url: string;
}

const CACHE_KEY = 'bing_wallpaper_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时
const BING_API_URL = '/api/bing/wallpaper';

function getCachedBingWallpaper(): BingWallpaper | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached) as BingWallpaper;
  } catch (e) {
    console.error('Failed to parse cached Bing wallpaper:', e);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function isCacheValid(wallpaper: BingWallpaper): boolean {
  const now = Date.now();
  return now - wallpaper.fetchedAt < CACHE_DURATION;
}

function setCachedBingWallpaper(wallpaper: BingWallpaper): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(wallpaper));
  } catch (e) {
    console.error('Failed to cache Bing wallpaper:', e);
  }
}

async function fetchBingWallpaperFromAPI(): Promise<BingWallpaper> {
  const response = await fetch(BING_API_URL);
  if (!response.ok) {
    throw new Error(`Backend API returned ${response.status}`);
  }

  const data: BingAPIResponse = await response.json();
  if (!data.url) {
    throw new Error('No URL in backend API response');
  }

  return {
    url: data.url,
    fetchedAt: Date.now(),
  };
}

export async function fetchBingWallpaper(): Promise<string> {
  // 检查缓存
  const cached = getCachedBingWallpaper();
  if (cached && isCacheValid(cached)) {
    return cached.url;
  }

  // 缓存无效或不存在，从后端 API 获取
  try {
    const wallpaper = await fetchBingWallpaperFromAPI();
    setCachedBingWallpaper(wallpaper);
    return wallpaper.url;
  } catch (e) {
    console.error('Failed to fetch Bing wallpaper from backend:', e);
    // 如果有过期缓存，降级使用
    if (cached) {
      return cached.url;
    }
    throw e;
  }
}
