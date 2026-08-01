import { describe, expect, it } from 'vitest';
import {
  looksLikeNetscapeHtml,
  parseNetscapeHtml,
  serializeNetscapeHtml,
  type ExportBookmark,
} from './browserBookmarks';

// —— 样本：Chrome 风格（未闭合 <DT>/<p>、ICON base64、PERSONAL_TOOLBAR_FOLDER）——
const CHROME_SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
    <DL><p>
        <DT><A HREF="https://example.com/" ADD_DATE="1700000000" ICON="data:image/png;base64,iVBORw0KGgo=">Example</A>
        <DT><H3 ADD_DATE="1700000000">技术</H3>
        <DL><p>
            <DT><A HREF="https://vuejs.org/" ADD_DATE="1700000000">Vue.js</A>
            <DT><H3 ADD_DATE="1700000000">前端</H3>
            <DL><p>
                <DT><A HREF="https://vitejs.dev/" ADD_DATE="1700000000">Vite</A>
            </DL><p>
        </DL><p>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000">未分类顶层</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com/" ADD_DATE="1700000000">Hacker News</A>
    </DL><p>
</DL><p>`;

// —— 样本：Firefox 风格（<DD> 说明、UNFILED_BOOKMARKS_FOLDER、ICON_URI）——
const FIREFOX_SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" UNFILED_BOOKMARKS_FOLDER="true">其他书签</H3>
    <DL><p>
        <DT><A HREF="https://developer.mozilla.org/" ICON_URI="https://developer.mozilla.org/favicon.ico">MDN</A>
        <DD>Web 开发文档
        <DT><H3>工具/资源</H3>
        <DL><p>
            <DT><A HREF="https://caniuse.com/">Can I use</A>
        </DL><p>
    </DL><p>
</DL><p>`;

// —— 样本：Safari 风格（无 <p> 占位、无属性、闭合规整、按名称剥根）——
const SAFARI_SAMPLE = `<!DOCTYPE html>
<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Bookmarks</title></head>
<body>
<h1>Bookmarks</h1>
<dl>
  <dt><h3>收藏</h3>
    <dl>
      <dt><a href="https://apple.com/">Apple</a></dt>
      <dt><h3>阅读</h3>
        <dl>
          <dt><a href="https://daringfireball.net/">Daring Fireball</a></dt>
        </dl>
      </dt>
    </dl>
  </dt>
</dl>
</body>
</html>`;

describe('parseNetscapeHtml', () => {
  it('parses Chrome sample: strips toolbar root, keeps nested folders as tag paths', () => {
    const r = parseNetscapeHtml(CHROME_SAMPLE);
    const byUrl = new Map(r.data.bookmarks.map((b) => [b.url, b]));

    // 书签栏根被剥离：Example 直属顶层 → 无标签
    expect(byUrl.get('https://example.com/')?.tagPaths).toEqual([]);
    // 嵌套目录成为多层级标签
    expect(byUrl.get('https://vuejs.org/')?.tagPaths).toEqual(['技术']);
    expect(byUrl.get('https://vitejs.dev/')?.tagPaths).toEqual(['技术/前端']);
    // 根目录之外的顶层目录不受剥根影响
    expect(byUrl.get('https://news.ycombinator.com/')?.tagPaths).toEqual(['未分类顶层']);
    // 标签集合含祖先层级
    expect(r.data.tags.map((t) => t.path)).toEqual(['技术', '技术/前端', '未分类顶层']);
    expect(r.bookmarkCount).toBe(4);
    expect(r.folderCount).toBe(3);
  });

  it('parses Chrome ICON data URI into faviconUrl', () => {
    const r = parseNetscapeHtml(CHROME_SAMPLE);
    const bm = r.data.bookmarks.find((b) => b.url === 'https://example.com/');
    expect(bm?.faviconUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('parses Firefox sample: strips unfiled root, reads DD description and ICON_URI', () => {
    const r = parseNetscapeHtml(FIREFOX_SAMPLE);
    const mdn = r.data.bookmarks.find((b) => b.url === 'https://developer.mozilla.org/');
    expect(mdn?.tagPaths).toEqual([]);
    expect(mdn?.description).toBe('Web 开发文档');
    expect(mdn?.faviconUrl).toBe('https://developer.mozilla.org/favicon.ico');
    // 目录名含 / → 替换为 -
    const caniuse = r.data.bookmarks.find((b) => b.url === 'https://caniuse.com/');
    expect(caniuse?.tagPaths).toEqual(['工具-资源']);
  });

  it('parses Safari-style sample: strips root by known name, nested folders work', () => {
    const r = parseNetscapeHtml(SAFARI_SAMPLE);
    const byUrl = new Map(r.data.bookmarks.map((b) => [b.url, b]));
    expect(byUrl.get('https://apple.com/')?.tagPaths).toEqual([]);
    expect(byUrl.get('https://daringfireball.net/')?.tagPaths).toEqual(['阅读']);
  });

  it('merges same URL across folders into one bookmark with multiple tagPaths', () => {
    const html = `<DL><p>
      <DT><H3>甲</H3>
      <DL><p><DT><A HREF="https://dup.example/">Dup A</A></DL><p>
      <DT><H3>乙</H3>
      <DL><p><DT><A HREF="https://dup.example/">Dup B</A></DL><p>
    </DL><p>`;
    const r = parseNetscapeHtml(html);
    expect(r.bookmarkCount).toBe(1);
    const bm = r.data.bookmarks[0]!;
    expect(bm.tagPaths.sort()).toEqual(['乙', '甲']);
    // 名称取首次出现
    expect(bm.name).toBe('Dup A');
  });

  it('drops oversized base64 icons (>32KB) and non-http ICON_URI', () => {
    const bigIcon = `data:image/png;base64,${'A'.repeat(33 * 1024)}`;
    const html = `<DL><p>
      <DT><A HREF="https://a.example/" ICON="${bigIcon}">Big</A>
      <DT><A HREF="https://b.example/" ICON_URI="file:///local.ico">Local</A>
    </DL><p>`;
    const r = parseNetscapeHtml(html);
    const byUrl = new Map(r.data.bookmarks.map((b) => [b.url, b]));
    expect(byUrl.get('https://a.example/')?.faviconUrl).toBeNull();
    expect(byUrl.get('https://b.example/')?.faviconUrl).toBeNull();
  });

  it('ignores empty folders and falls back to url as name for anonymous links', () => {
    const html = `<DL><p>
      <DT><H3>空目录</H3>
      <DL><p></DL><p>
      <DT><A HREF="https://noname.example/"></A>
    </DL><p>`;
    const r = parseNetscapeHtml(html);
    expect(r.data.tags).toEqual([]);
    expect(r.data.bookmarks[0]?.name).toBe('https://noname.example/');
  });
});

describe('looksLikeNetscapeHtml', () => {
  it('detects the Netscape doctype and Safari-style plain html', () => {
    expect(looksLikeNetscapeHtml(CHROME_SAMPLE)).toBe(true);
    expect(looksLikeNetscapeHtml(SAFARI_SAMPLE)).toBe(true);
  });

  it('rejects json and plain text', () => {
    expect(looksLikeNetscapeHtml('{"version":1}')).toBe(false);
    expect(looksLikeNetscapeHtml('hello world')).toBe(false);
  });
});

describe('serializeNetscapeHtml', () => {
  const sample: ExportBookmark[] = [
    {
      url: 'https://vuejs.org/',
      name: 'Vue.js',
      description: '渐进式框架',
      faviconUrl: 'https://vuejs.org/logo.svg',
      tagPaths: ['技术/前端', '收藏夹2'],
    },
    {
      url: 'https://plain.example/?a=1&b=<x>',
      name: 'Plain & "quoted"',
      description: null,
      faviconUrl: 'data:image/png;base64,iVBORw0KGgo=',
      tagPaths: [],
    },
  ];

  it('emits Netscape header and wraps everything in a toolbar root folder', () => {
    const html = serializeNetscapeHtml(sample, new Date(1700000000000));
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('PERSONAL_TOOLBAR_FOLDER="true"');
    expect(html).toContain('ADD_DATE="1700000000"');
  });

  it('duplicates a multi-tag bookmark into each folder; untagged goes to root', () => {
    const html = serializeNetscapeHtml(sample, new Date(1700000000000));
    // 两个标签 → 出现两次
    expect(html.match(/HREF="https:\/\/vuejs\.org\/"/g)).toHaveLength(2);
    expect(html).toContain('<H3 ADD_DATE="1700000000">技术</H3>');
    expect(html).toContain('<H3 ADD_DATE="1700000000">前端</H3>');
    expect(html).toContain('<H3 ADD_DATE="1700000000">收藏夹2</H3>');
    // 说明写为 <DD>
    expect(html).toContain('<DD>渐进式框架');
    // 图标：http 用 ICON_URI，data URI 用 ICON
    expect(html).toContain('ICON_URI="https://vuejs.org/logo.svg"');
    expect(html).toContain('ICON="data:image/png;base64,iVBORw0KGgo="');
  });

  it('escapes html entities in urls and names', () => {
    const html = serializeNetscapeHtml(sample, new Date(1700000000000));
    expect(html).toContain('HREF="https://plain.example/?a=1&amp;b=&lt;x&gt;"');
    expect(html).toContain('Plain &amp; &quot;quoted&quot;');
  });

  it('round-trips: parse(serialize(x)) preserves urls, names and tagPaths', () => {
    const html = serializeNetscapeHtml(sample, new Date(1700000000000));
    const r = parseNetscapeHtml(html);
    const byUrl = new Map(r.data.bookmarks.map((b) => [b.url, b]));

    const vue = byUrl.get('https://vuejs.org/');
    expect(vue?.name).toBe('Vue.js');
    expect(vue?.description).toBe('渐进式框架');
    expect(vue?.faviconUrl).toBe('https://vuejs.org/logo.svg');
    expect(vue?.tagPaths.sort()).toEqual(['技术/前端', '收藏夹2']);

    const plain = byUrl.get('https://plain.example/?a=1&b=<x>');
    expect(plain?.name).toBe('Plain & "quoted"');
    // 顶层书签栏根在解析时被剥离 → 无标签
    expect(plain?.tagPaths).toEqual([]);
    expect(plain?.faviconUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});
