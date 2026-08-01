import { ref, onMounted } from 'vue';
import { fetchBingWallpaper } from '@/lib/bingWallpaper';

// 模块级共享状态：AppLayout(useBackground) 与背景设置页可能同时挂载，
// 两处调用 useBingWallpaper() 时共享同一份状态与在途请求，避免各自 onMounted 重复抓取。
const url = ref<string | null>(null);
const loading = ref(false);
const error = ref(false);
let inFlight: Promise<void> | null = null;

async function load(): Promise<void> {
  if (inFlight) return inFlight; // 去重：并发/多实例复用同一次加载
  loading.value = true;
  error.value = false;
  inFlight = (async () => {
    try {
      url.value = await fetchBingWallpaper();
    } catch (e) {
      console.error('Failed to fetch Bing wallpaper:', e);
      error.value = true;
      url.value = null;
    } finally {
      loading.value = false;
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useBingWallpaper() {
  onMounted(() => {
    void load();
  });
  return { url, loading, error, reload: load };
}
