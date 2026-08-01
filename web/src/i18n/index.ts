import { createI18n } from 'vue-i18n';
import { messages } from './messages';
import { resolveLocale, type Locale } from './locale';

export { resolveLocale, type Locale };

// 显式将 Legacy 泛型固定为 false，使 i18n.global 为 Composer（其 locale 是 Ref），
// 否则返回类型会退化为 legacy VueI18n 与 Composer 的联合，导致 locale.value 无法访问。
export const i18n = createI18n<false>({
  legacy: false,
  locale: resolveLocale(
    typeof document !== 'undefined' ? document.cookie : undefined,
    typeof navigator !== 'undefined' ? navigator.language : undefined,
  ),
  fallbackLocale: 'en',
  messages,
});

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  document.cookie = `navi_locale=${locale};path=/;max-age=31536000`;
  document.documentElement.lang = locale;
}

export function toggleLocale(): void {
  setLocale(i18n.global.locale.value === 'zh' ? 'en' : 'zh');
}
