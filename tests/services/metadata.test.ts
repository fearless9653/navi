import { describe, it, expect } from 'vitest';
import { extractMetadata } from '@/services/metadata';

const BASE = 'https://example.com/page';

describe('extractMetadata', () => {
  it('抽取 title 并去空白', () => {
    const md = extractMetadata('<html><head><title>  Hello\n World </title></head>', BASE);
    expect(md.title).toBe('Hello World');
  });

  it('description 优先用 name，回退 og', () => {
    const withName = extractMetadata(
      '<meta name="description" content="real desc"><meta property="og:description" content="og desc">',
      BASE,
    );
    expect(withName.description).toBe('real desc');
    const onlyOg = extractMetadata('<meta property="og:description" content="og desc">', BASE);
    expect(onlyOg.description).toBe('og desc');
  });

  it('favicon 相对路径解析为绝对', () => {
    const md = extractMetadata('<link rel="icon" href="/static/fav.png">', BASE);
    expect(md.faviconUrl).toBe('https://example.com/static/fav.png');
  });

  it('shortcut icon 也识别', () => {
    const md = extractMetadata('<link rel="shortcut icon" href="favicon.ico">', BASE);
    expect(md.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('无 icon 时回退 /favicon.ico', () => {
    const md = extractMetadata('<title>x</title>', BASE);
    expect(md.faviconUrl).toBe('https://example.com/favicon.ico');
  });

  it('apple-touch-icon 作为回退', () => {
    const md = extractMetadata('<link rel="apple-touch-icon" href="/a.png">', BASE);
    expect(md.faviconUrl).toBe('https://example.com/a.png');
  });

  it('反转义 HTML 实体', () => {
    const md = extractMetadata('<title>A &amp; B &#39;C&#39; &lt;d&gt;</title>', BASE);
    expect(md.title).toBe("A & B 'C' <d>");
  });

  it('空 HTML 安全返回（title/desc 为 null，favicon 回退）', () => {
    const md = extractMetadata('', BASE);
    expect(md.title).toBeNull();
    expect(md.description).toBeNull();
    expect(md.faviconUrl).toBe('https://example.com/favicon.ico');
  });
  it('标题在无 title 标签时回退 og:title，再回退 twitter:title', () => {
    const onlyOg = extractMetadata('<meta property="og:title" content="OG Title">', BASE);
    expect(onlyOg.title).toBe('OG Title');
    const twitter = extractMetadata('<meta name="twitter:title" content="Tw Title">', BASE);
    expect(twitter.title).toBe('Tw Title');
    const preferTitle = extractMetadata(
      '<title>Real</title><meta property="og:title" content="OG Title">',
      BASE,
    );
    expect(preferTitle.title).toBe('Real');
  });

  it('description 在 name 与 og 都缺时回退 twitter:description', () => {
    const md = extractMetadata('<meta name="twitter:description" content="tw desc">', BASE);
    expect(md.description).toBe('tw desc');
  });
});
