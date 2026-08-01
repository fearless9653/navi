import { describe, expect, it } from 'vitest';
import { stripSloganMarkup } from '@/services/sloganMarkup';

// 后端只需 strip 用于字数校验；这里镜像前端子集，确保两端副本行为一致。
describe('stripSloganMarkup', () => {
  it('纯文本原样返回', () => {
    expect(stripSloganMarkup('把时间留给热爱的事。')).toBe('把时间留给热爱的事。');
  });

  it('剥离合法标记', () => {
    expect(stripSloganMarkup('<b><i>x</i></b>')).toBe('x');
    expect(stripSloganMarkup('<s>x</s>')).toBe('x');
    expect(stripSloganMarkup('<c=red>x</c>')).toBe('x');
  });

  it('未闭合标记保留为字面（计入字数）', () => {
    expect(stripSloganMarkup('<b>x')).toBe('<b>x');
  });

  it('无配对 close 保留为字面', () => {
    expect(stripSloganMarkup('</b>')).toBe('</b>');
  });

  it('交叉嵌套：能配对的剥离、不能配对的保留', () => {
    expect(stripSloganMarkup('<b><i>x</b></i>')).toBe('<b>x</b>');
  });

  it('非法颜色仍剥离 tag', () => {
    expect(stripSloganMarkup('<c=bad>x</c>')).toBe('x');
  });

  it('空串返回空串', () => {
    expect(stripSloganMarkup('')).toBe('');
  });
});
