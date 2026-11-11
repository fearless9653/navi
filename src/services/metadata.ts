/** 轻量 HTML 元数据抽取（正则，无 DOM，Node 与 Workers 通用）。 */

export interface Metadata {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(parseInt(d, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'); // 放最后，避免二次解码
}

function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 解析单个标签字符串的属性为小写键的 map。 */
function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    const key = m[1]!.toLowerCase();
    out[key] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return out;
}

function metaKey(a: Record<string, string>): string {
  return (a.property ?? a.name ?? '').toLowerCase();
}

export function extractMetadata(html: string, baseUrl: string): Metadata {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleTag = titleM ? clean(decodeEntities(titleM[1] ?? '')) || null : null;

  let desc: string | null = null;
  let ogDesc: string | null = null;
  let twitterDesc: string | null = null;
  let ogTitle: string | null = null;
  let twitterTitle: string | null = null;
  const metaRe = /<meta\b[^>]*>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = metaRe.exec(html))) {
    const a = parseAttrs(mm[0]);
    const key = metaKey(a);
    const content = clean(decodeEntities(a.content ?? '')) || null;
    if (!content) continue;
    if (key === 'description' && desc === null) desc = content;
    if (key === 'og:description' && ogDesc === null) ogDesc = content;
    if (key === 'twitter:description' && twitterDesc === null) twitterDesc = content;
    if (key === 'og:title' && ogTitle === null) ogTitle = content;
    if (key === 'twitter:title' && twitterTitle === null) twitterTitle = content;
  }
  const title = titleTag ?? ogTitle ?? twitterTitle;
  const description = desc ?? ogDesc ?? twitterDesc;

  let iconHref: string | null = null;
  let appleHref: string | null = null;
  const linkRe = /<link\b[^>]*>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html))) {
    const a = parseAttrs(lm[0]);
    const rel = (a.rel ?? '').toLowerCase();
    if (!a.href) continue;
    if (rel.includes('apple') && rel.includes('icon')) {
      if (appleHref === null) appleHref = a.href;
    } else if (/\bicon\b/.test(rel)) {
      if (iconHref === null) iconHref = a.href;
    }
  }
  const chosen = iconHref ?? appleHref;

  let faviconUrl: string | null;
  try {
    faviconUrl = new URL(chosen ?? '/favicon.ico', baseUrl).toString();
  } catch {
    faviconUrl = null;
  }

  return { title, description, faviconUrl };
}
