// 纯逻辑（无 DOM 依赖），便于在 node 环境下单测。
export type Locale = 'zh' | 'en';

/** 由 cookie 优先、否则浏览器语言判定 locale（zh / 其余=en）。 */
export function resolveLocale(cookie: string | undefined, navLang: string | undefined): Locale {
  const m = cookie?.match(/(?:^|;\s*)navi_locale=(zh|en)/);
  if (m) return m[1] as Locale;
  return (navLang ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
