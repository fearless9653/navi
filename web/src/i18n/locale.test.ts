import { describe, it, expect } from 'vitest';
import { resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('cookie 优先', () => {
    expect(resolveLocale('a=1; navi_locale=en; b=2', 'zh-CN')).toBe('en');
    expect(resolveLocale('navi_locale=zh', 'en-US')).toBe('zh');
  });
  it('无 cookie 用浏览器语言（zh 前缀→zh，其余→en）', () => {
    expect(resolveLocale(undefined, 'zh-CN')).toBe('zh');
    expect(resolveLocale(undefined, 'en-US')).toBe('en');
    expect(resolveLocale(undefined, undefined)).toBe('en');
  });
});
