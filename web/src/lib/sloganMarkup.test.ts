import { describe, expect, it } from 'vitest';
import { parseSlogan, stripSloganMarkup } from './sloganMarkup';

const NONE = { bold: false, italic: false, strike: false, color: null };

describe('parseSlogan', () => {
  it('纯文本：单段、无样式', () => {
    expect(parseSlogan('把时间留给热爱的事。')).toEqual([
      { text: '把时间留给热爱的事。', ...NONE },
    ]);
  });

  it('空串：无段落', () => {
    expect(parseSlogan('')).toEqual([]);
  });

  it('加粗 / 斜体 / 删除线', () => {
    expect(parseSlogan('<b>x</b>')).toEqual([{ text: 'x', ...NONE, bold: true }]);
    expect(parseSlogan('<i>x</i>')[0]).toMatchObject({ text: 'x', italic: true });
    expect(parseSlogan('<s>x</s>')[0]).toMatchObject({ text: 'x', strike: true });
  });

  it('颜色名与十六进制（3/6/8 位），大小写归一为小写', () => {
    expect(parseSlogan('<c=red>x</c>')[0]).toMatchObject({ color: 'red' });
    expect(parseSlogan('<c=#abc>x</c>')[0]).toMatchObject({ color: '#abc' });
    expect(parseSlogan('<c=#e53935>x</c>')[0]).toMatchObject({ color: '#e53935' });
    expect(parseSlogan('<c=#aabbccff>x</c>')[0]).toMatchObject({ color: '#aabbccff' });
    expect(parseSlogan('<c=#ABC>x</c>')[0]).toMatchObject({ color: '#abc' });
    expect(parseSlogan('<c=RED>x</c>')[0]).toMatchObject({ color: 'red' });
  });

  it('非法 / 空颜色值：保留内文、丢弃颜色', () => {
    expect(parseSlogan('<c=notacolor>x</c>')).toEqual([{ text: 'x', ...NONE }]);
    expect(parseSlogan('<c=>x</c>')[0]).toMatchObject({ text: 'x', color: null });
  });

  it('标记大小写不敏感', () => {
    expect(parseSlogan('<B>x</B>')[0]).toMatchObject({ text: 'x', bold: true });
    expect(parseSlogan('<C=red>x</C>')[0]).toMatchObject({ text: 'x', color: 'red' });
  });

  it('嵌套 <b><i>', () => {
    expect(parseSlogan('<b><i>x</i></b>')).toEqual([
      { text: 'x', ...NONE, bold: true, italic: true },
    ]);
  });

  it('混合分段', () => {
    expect(parseSlogan('mix <b>bold</b> end')).toEqual([
      { text: 'mix ', ...NONE },
      { text: 'bold', ...NONE, bold: true },
      { text: ' end', ...NONE },
    ]);
  });

  it('未闭合 <b>：原样降级为字面文字，不吞字', () => {
    expect(parseSlogan('<b>没闭合')).toEqual([{ text: '<b>没闭合', ...NONE }]);
  });

  it('无配对的 close：原样降级为字面文字', () => {
    expect(parseSlogan('</b>')).toEqual([{ text: '</b>', ...NONE }]);
  });

  it('交叉嵌套：能配对的生效，不能配对的原样保留', () => {
    // <i>..</i> 严格栈顶匹配成功 → x 斜体；<b>/</b> 无法配对 → 原样字面
    const segs = parseSlogan('<b><i>x</b></i>');
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.text).join('')).toBe('<b>x</b>');
    expect(segs[1]).toMatchObject({ text: 'x</b>', italic: true });
  });

  it('落单的 < 不被当作标记', () => {
    expect(parseSlogan('a <3 b')).toEqual([{ text: 'a <3 b', ...NONE }]);
  });
});

describe('stripSloganMarkup', () => {
  it('纯文本原样返回', () => {
    expect(stripSloganMarkup('把时间留给热爱的事。')).toBe('把时间留给热爱的事。');
  });

  it('空串返回空串', () => {
    expect(stripSloganMarkup('')).toBe('');
  });

  it('剥离合法标记', () => {
    expect(stripSloganMarkup('<b><i>x</i></b>')).toBe('x');
    expect(stripSloganMarkup('<c=red>x</c>')).toBe('x');
  });

  it('未闭合标记计入字数（渲染时为字面文字）', () => {
    expect(stripSloganMarkup('<b>x')).toBe('<b>x');
  });

  it('无配对 close 计入字数', () => {
    expect(stripSloganMarkup('</b>')).toBe('</b>');
  });

  it('非法颜色仍剥离 tag、保留内文', () => {
    expect(stripSloganMarkup('<c=bad>x</c>')).toBe('x');
  });

  it('与 parseSlogan 一致：任意输入等于段落文本拼接', () => {
    const cases = [
      '',
      'plain',
      '<b>x</b>',
      '<b>没闭合',
      '</b>',
      '<b><i>x</b></i>',
      '<c=red>x</c>',
      '<c=bad>x</c>',
      'a <3 b',
      '<B>x</B>',
    ];
    for (const c of cases) {
      expect(stripSloganMarkup(c)).toBe(
        parseSlogan(c)
          .map((p) => p.text)
          .join(''),
      );
    }
  });
});
