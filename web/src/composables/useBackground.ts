import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { usePrefsStore } from '@/stores/prefs';
import { useTheme } from './useTheme';
import { useBingWallpaper } from './useBingWallpaper';

/**
 * 背景图片与遮罩层管理
 */
export function useBackground() {
  const prefs = usePrefsStore();
  const { theme } = useTheme();

  // Bing 壁纸（在外部初始化，避免在 computed 中重复创建）
  const bingWallpaper = useBingWallpaper();

  const imageLoaded = ref(false);
  const imageError = ref(false);

  // 用响应式 ref 跟踪系统暗色偏好，避免 computed 中直接访问 DOM 不具响应性
  const systemPrefersDark = ref(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  // 监听系统主题变化
  let mediaQuery: MediaQueryList | null = null;
  const handleMediaChange = (e: MediaQueryListEvent) => {
    systemPrefersDark.value = e.matches;
  };

  onMounted(() => {
    if (typeof window !== 'undefined') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', handleMediaChange);
    }
  });

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', handleMediaChange);
  });

  // 背景图片样式
  const backgroundStyle = computed(() => {
    const type = prefs.prefs?.backgroundType;

    if (!type || type === 'none' || imageError.value) {
      return {};
    }

    if (type === 'bing') {
      const bingUrl = bingWallpaper.url.value;
      if (!bingUrl || bingWallpaper.error.value) return {};
      return { backgroundImage: `url(${bingUrl})` };
    }

    if (type === 'custom') {
      const url = prefs.prefs?.backgroundImageUrl;
      if (!url) return {};
      return { backgroundImage: `url(${url})` };
    }

    return {};
  });

  // 判断当前是否为暗色模式（完全响应式）
  const isDark = computed(() => {
    if (theme.value === 'dark') return true;
    if (theme.value === 'light') return false;
    // system：使用响应式 ref 而非直接访问 DOM
    return systemPrefersDark.value;
  });

  // 顶部遮罩不透明度（0-1）：壁纸「主权区」——首屏上半（标语 + 搜索框背后），
  // 让壁纸尽量透出。沿用用户设定的可见度反转。
  // 注意：数据库存储的是"背景可见度"百分比，需要反转成"遮罩不透明度"
  // 例如：backgroundOpacityLight=70 表示背景 70% 可见，遮罩应该是 30% 不透明。
  const overlayTopOpacity = computed(() => {
    if (!prefs.prefs) return 0.3; // 默认：背景 70% 可见
    const backgroundVisibility = isDark.value
      ? (prefs.prefs.backgroundOpacityDark ?? 70)
      : (prefs.prefs.backgroundOpacityLight ?? 70);
    return (100 - backgroundVisibility) / 100; // 反转：70% 可见 = 30% 遮罩
  });

  // 底部遮罩不透明度：内容「主权区」——书签网格 / 侧栏背后，压到接近实色，
  // 让文字与卡片脱离壁纸噪点。恒不低于顶部，避免用户把可见度调很低时底部反而更透。
  const overlayBottomOpacity = computed(() =>
    Math.max(overlayTopOpacity.value, isDark.value ? 0.9 : 0.88),
  );

  // 遮罩层样式（用于 style 绑定）：垂直渐变 scrim。
  // 顶部沿用用户可见度（壁纸在场），向下渐变到接近实色（内容清晰）。
  // 0%→32% 维持顶部浓度（覆盖标语 + 搜索框区），32%→78% 过渡，78%→100% 维持底部浓度。
  const overlayStyle = computed(() => {
    const rgb = isDark.value ? '0, 0, 0' : '255, 255, 255';
    const top = overlayTopOpacity.value;
    const bottom = overlayBottomOpacity.value;
    return {
      backgroundImage: `linear-gradient(to bottom, rgba(${rgb}, ${top}) 0%, rgba(${rgb}, ${top}) 32%, rgba(${rgb}, ${bottom}) 78%, rgba(${rgb}, ${bottom}) 100%)`,
    };
  });

  // 是否显示背景（有 URL 且未加载失败）
  const hasBackground = computed(() => {
    const type = prefs.prefs?.backgroundType;
    if (!type || type === 'none' || imageError.value) return false;

    if (type === 'bing') {
      return !!(bingWallpaper.url.value && !bingWallpaper.error.value);
    }

    if (type === 'custom') {
      return !!prefs.prefs?.backgroundImageUrl;
    }

    return false;
  });

  // 监听 URL 变化，重置加载状态
  // 若图片已在浏览器缓存中（img.complete === true），直接标记为已加载，避免路由切换时背景闪白
  watch(
    () => prefs.prefs?.backgroundImageUrl,
    (newUrl, oldUrl) => {
      if (newUrl !== oldUrl) {
        imageError.value = false;
        if (newUrl) {
          // 同步检测浏览器缓存：创建 Image 对象并立即检查 complete 属性
          const probe = new Image();
          probe.src = newUrl;
          if (probe.complete && probe.naturalWidth > 0) {
            // 图片已缓存，直接显示，无需等待 onload 异步回调
            imageLoaded.value = true;
          } else {
            imageLoaded.value = false;
          }
        } else {
          imageLoaded.value = false;
        }
      }
    },
    { immediate: true },
  );

  // 背景类型切换（如 custom 失败后改用 bing）时重置失败标记，
  // 否则旧的 imageError 会一直压住新类型的背景。
  watch(
    () => prefs.prefs?.backgroundType,
    (newType, oldType) => {
      if (newType !== oldType) {
        imageError.value = false;
        imageLoaded.value = false;
      }
    },
  );

  // 图片加载成功
  function handleImageLoad() {
    imageLoaded.value = true;
    imageError.value = false;
  }

  // 图片加载失败
  function handleImageError() {
    imageLoaded.value = false;
    imageError.value = true;
  }

  return {
    backgroundStyle,
    overlayStyle,
    hasBackground,
    imageLoaded,
    imageError,
    handleImageLoad,
    handleImageError,
  };
}
