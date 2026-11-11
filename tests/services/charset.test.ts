import { describe, expect, it } from 'vitest';
import { charsetFromContentType, decodeBytes, decodeHtmlBytes } from '@/services/charset';
import { decodeGbk } from '@/services/gbk';

describe('charset', () => {
  it('从 Content-Type 读出 charset', () => {
    expect(charsetFromContentType('text/html; charset=GBK')).toBe('GBK');
    expect(charsetFromContentType('text/html')).toBeNull();
  });

  it('按 meta charset 解码，缺省 utf-8', () => {
    const html = new TextEncoder().encode('<meta charset="utf-8"><title>Hi</title>');
    expect(decodeHtmlBytes(html, 'text/html')).toContain('Hi');
  });

  it('GBK 字节能解出中文（含自带表回退）', () => {
    const nihao = Uint8Array.of(0xc4, 0xe3, 0xba, 0xc3);
    expect(decodeGbk(nihao)).toBe('你好');
    expect(decodeBytes(nihao, 'gbk')).toBe('你好');
    expect(decodeBytes(nihao, 'gb2312')).toBe('你好');
    const html = Uint8Array.from([
      ...new TextEncoder().encode('<meta charset="gbk"><title>'),
      ...nihao,
      ...new TextEncoder().encode('</title>'),
    ]);
    expect(decodeHtmlBytes(html, 'text/html')).toContain('你好');
  });
});
