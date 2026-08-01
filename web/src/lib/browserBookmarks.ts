// 浏览器通用书签（Netscape Bookmark File Format）解析与序列化纯逻辑。
// 解析用浏览器内置 DOMParser：对未闭合 <DT>/<p>、大小写混乱、Safari 精简结构的
// 容错即浏览器自身的容错，无需第三方包。

/** 解析产物：与私有导入 /import 的 data 形状一致（仅 tags + bookmarks 子集）。 */
export interface BrowserImportData {
  tags: { path: string }[];
  bookmarks: {
    url: string;
    name: string;
    description: string | null;
    faviconUrl: string | null;
    tagPaths: string[];
  }[];
}

export interface ParseResult {
  data: BrowserImportData;
  bookmarkCount: number;
  folderCount: number;
}

/** 导出输入：私有 /export 返回值中 bookmarks 的最小子集。 */
export interface ExportBookmark {
  url: string;
  name: string;
  description: string | null;
  faviconUrl: string | null;
  tagPaths: string[];
}

/** base64 data URI 图标大小上限（字符数近似字节数）；超限丢弃避免撑爆 DB。 */
const ICON_MAX_LENGTH = 32 * 1024;

/** Safari 等无根目录属性时，按名称剥离的已知顶层根目录名（小写比较）。 */
const ROOT_FOLDER_NAMES = new Set([
  'bookmarks bar',
  'bookmarks menu',
  'bookmarks toolbar',
  'other bookmarks',
  'favorites',
  'favourites',
  '书签栏',
  '其他书签',
  '收藏',
  '收藏夹',
]);

/** 目录名清洗：trim 后把 path 分隔符 / 替换为 -（对齐后端 tag_name_slash 校验）。 */
function sanitizeFolderName(name: string): string {
  return name.trim().replace(/\//g, '-');
}

/** 取 <a> 的图标：ICON（data URI，≤32KB）优先，否则 ICON_URI（仅 http(s)）。 */
function extractIcon(a: Element): string | null {
  const icon = a.getAttribute('icon');
  if (icon && icon.startsWith('data:') && icon.length <= ICON_MAX_LENGTH) return icon;
  const iconUri = a.getAttribute('icon_uri');
  if (iconUri && /^https?:\/\//i.test(iconUri)) return iconUri;
  return null;
}

type ParsedBookmark = BrowserImportData['bookmarks'][number];

/**
 * 容器直属的语义元素（h3/a/dd）。"直属"= 最近的 <dl> 祖先是当前容器；
 * 容器本身不是 <dl>（body 兜底）时取无 <dl> 祖先的元素。
 * 这样不依赖 <DT> 是否闭合 —— 浏览器无论把后续节点解析为 <dt> 的子还是兄弟，
 * 其最近 <dl> 祖先都不变。
 */
function directItems(container: Element): Element[] {
  const isDl = container.tagName.toLowerCase() === 'dl';
  return [...container.querySelectorAll('h3, a, dd')].filter((el) => {
    const nearestDl = el.parentElement?.closest('dl') ?? null;
    return isDl ? nearestDl === container : nearestDl === null;
  });
}

/**
 * 找 <h3> 目录对应的子 <dl>。规范结构是 <dt><h3/><dl/></dt>，但浏览器解析
 * 未闭合 <dt> 后 <dl> 可能成为 <h3> 的兄弟或 <dt> 的兄弟，逐一兜底。
 */
function findFolderDl(h3: Element): Element | null {
  const scan = (start: Element | null): Element | null => {
    for (let sib = start; sib; sib = sib.nextElementSibling) {
      const t = sib.tagName.toLowerCase();
      if (t === 'dl') return sib;
      if (t === 'dt' || t === 'h3' || t === 'a') break;
    }
    return null;
  };
  // 1) <dt> 内：h3 后跟 <dl>（或 dd 再 dl）
  const parent = h3.parentElement;
  if (parent && parent.tagName.toLowerCase() !== 'dl') {
    const inParent = scan(h3.nextElementSibling);
    if (inParent) return inParent;
    // 2) <dl> 成为 <dt> 的兄弟
    return scan(parent.nextElementSibling);
  }
  // 3) h3 直接位于 dl 下（Safari 等精简结构）
  return scan(h3.nextElementSibling);
}

/** 顶层是否为应剥离的根目录（书签栏/其他书签等）：属性优先，Safari 按名称兜底。 */
function isRootFolder(h3: Element): boolean {
  if (
    h3.getAttribute('personal_toolbar_folder') !== null ||
    h3.getAttribute('unfiled_bookmarks_folder') !== null
  ) {
    return true;
  }
  return ROOT_FOLDER_NAMES.has((h3.textContent ?? '').trim().toLowerCase());
}

/**
 * 递归遍历容器：<h3> 目录（其子 <dl> 递归），<a> 书签，<dd> 前一书签的说明。
 * isTop 时命中根目录特征的 <h3> 剥离一层（子项以当前 parentPath 直接遍历）。
 */
function walkList(
  container: Element,
  parentPath: string,
  byUrl: Map<string, ParsedBookmark>,
  isTop: boolean,
): void {
  let lastBookmark: ParsedBookmark | null = null;

  for (const el of directItems(container)) {
    const tagName = el.tagName.toLowerCase();
    if (tagName === 'h3') {
      lastBookmark = null;
      const childDl = findFolderDl(el);
      const strip = isTop && isRootFolder(el);
      const name = strip ? '' : sanitizeFolderName(el.textContent ?? '');
      const folderPath = name ? (parentPath ? `${parentPath}/${name}` : name) : parentPath;
      if (childDl) walkList(childDl, folderPath, byUrl, false);
    } else if (tagName === 'a') {
      const url = el.getAttribute('href')?.trim() ?? '';
      if (!url) continue;
      let bm = byUrl.get(url);
      if (!bm) {
        bm = {
          url,
          name: (el.textContent ?? '').trim() || url,
          description: null,
          faviconUrl: null,
          tagPaths: [],
        };
        byUrl.set(url, bm);
      }
      // 同 URL 多目录 → 合并 tagPaths（与"一个网址多标签"模型一致）。
      if (parentPath && !bm.tagPaths.includes(parentPath)) bm.tagPaths.push(parentPath);
      if (!bm.faviconUrl) bm.faviconUrl = extractIcon(el);
      lastBookmark = bm;
    } else if (tagName === 'dd') {
      const desc = (el.textContent ?? '').trim();
      if (lastBookmark && desc && !lastBookmark.description) lastBookmark.description = desc;
      lastBookmark = null;
    }
  }
}

/**
 * 解析 Netscape 书签 HTML。目录 → 多层级标签 path；同一 URL 出现在多个目录 →
 * 合并为一条书签多个 tagPaths。顶层"书签栏/其他书签"等根目录自动剥离一层；
 * 空目录不产生标签。
 */
export function parseNetscapeHtml(html: string): ParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const byUrl = new Map<string, ParsedBookmark>();

  // 顶层容器：第一个 <dl>；缺失时（极不规范文件）退化为整个 body。
  const topDl = doc.querySelector('dl') ?? doc.body;
  walkList(topDl, '', byUrl, true);

  // 由书签引用的 path 补全祖先层级得到标签集合（后端也会补，此处为统计准确）。
  const usedPaths = new Set<string>();
  for (const bm of byUrl.values()) {
    for (const p of bm.tagPaths) {
      let acc = '';
      for (const seg of p.split('/')) {
        acc = acc ? `${acc}/${seg}` : seg;
        usedPaths.add(acc);
      }
    }
  }

  const bookmarks = [...byUrl.values()];
  return {
    data: {
      tags: [...usedPaths].sort().map((path) => ({ path })),
      bookmarks,
    },
    bookmarkCount: bookmarks.length,
    folderCount: usedPaths.size,
  };
}

/** 是否像 Netscape 书签 HTML（内容识别用，不看文件后缀）。 */
export function looksLikeNetscapeHtml(text: string): boolean {
  const head = text.slice(0, 2048);
  if (/NETSCAPE-Bookmark-file/i.test(head)) return true;
  // Safari 导出的 DOCTYPE 可能不同：兜底看是否为含 <a href> 的 HTML 文档。
  return /<html|<!doctype html/i.test(head) && /<a\s[^>]*href\s*=/i.test(text);
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]!);
}

interface FolderNode {
  children: Map<string, FolderNode>;
  bookmarks: ExportBookmark[];
}

function newFolder(): FolderNode {
  return { children: new Map(), bookmarks: [] };
}

/**
 * 序列化为 Netscape 书签 HTML。标签 path → 多层级目录；一个书签有 N 个标签 →
 * 在 N 个目录下各出现一次；无标签书签放顶层目录直下。整体包在一个
 * PERSONAL_TOOLBAR_FOLDER 的"书签栏"目录内，浏览器导入后落到书签栏。
 */
export function serializeNetscapeHtml(
  bookmarks: ExportBookmark[],
  exportedAt: Date = new Date(),
): string {
  const root = newFolder();
  for (const bm of bookmarks) {
    if (bm.tagPaths.length === 0) {
      root.bookmarks.push(bm);
      continue;
    }
    for (const path of bm.tagPaths) {
      let node = root;
      for (const seg of path.split('/').filter(Boolean)) {
        let child = node.children.get(seg);
        if (!child) {
          child = newFolder();
          node.children.set(seg, child);
        }
        node = child;
      }
      node.bookmarks.push(bm);
    }
  }

  const addDate = Math.floor(exportedAt.getTime() / 1000);
  const lines: string[] = [];

  const writeBookmark = (bm: ExportBookmark, indent: string): void => {
    const attrs = [`HREF="${esc(bm.url)}"`, `ADD_DATE="${addDate}"`];
    if (bm.faviconUrl) {
      attrs.push(
        bm.faviconUrl.startsWith('data:')
          ? `ICON="${esc(bm.faviconUrl)}"`
          : `ICON_URI="${esc(bm.faviconUrl)}"`,
      );
    }
    lines.push(`${indent}<DT><A ${attrs.join(' ')}>${esc(bm.name)}</A>`);
    if (bm.description) lines.push(`${indent}<DD>${esc(bm.description)}`);
  };

  const writeFolder = (node: FolderNode, indent: string): void => {
    lines.push(`${indent}<DL><p>`);
    const inner = `${indent}    `;
    for (const [name, child] of [...node.children.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(`${inner}<DT><H3 ADD_DATE="${addDate}">${esc(name)}</H3>`);
      writeFolder(child, inner);
    }
    for (const bm of node.bookmarks) writeBookmark(bm, inner);
    lines.push(`${indent}</DL><p>`);
  };

  lines.push(
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
    `    <DT><H3 ADD_DATE="${addDate}" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>`,
  );
  writeFolder(root, '    ');
  lines.push('</DL><p>', '');
  return lines.join('\n');
}
