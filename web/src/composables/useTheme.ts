import { ref } from 'vue';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'navi_theme';
const theme = ref<Theme>('system');

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(t: Theme): void {
  const dark = t === 'dark' || (t === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

/** 应用启动时调用：读取保存的主题并应用，监听系统切换。 */
export function initTheme(): void {
  const saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
  theme.value = saved;
  apply(saved);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') apply('system');
  });
}

export function useTheme() {
  function setTheme(t: Theme): void {
    theme.value = t;
    localStorage.setItem(STORAGE_KEY, t);
    apply(t);
  }
  /** 三态轮换：system → light → dark → system。 */
  function cycleTheme(): void {
    const next: Theme =
      theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system';
    setTheme(next);
  }
  return { theme, setTheme, cycleTheme };
}
