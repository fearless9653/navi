import { describe, it, expect } from 'vitest';
import { likePattern } from '@/services/likeEscape';

describe('likePattern', () => {
  it('转义 \\ % _ 并小写、两端加 %', () => {
    expect(likePattern('a%b_c\\d')).toBe('%a\\%b\\_c\\\\d%');
  });

  it('转为小写以便 ASCII 大小写不敏感', () => {
    expect(likePattern('FooBar')).toBe('%foobar%');
  });

  it('中文原样保留（仅包裹）', () => {
    expect(likePattern('知乎')).toBe('%知乎%');
  });

  it('空串得到 %%（匹配任意）', () => {
    expect(likePattern('')).toBe('%%');
  });
});
