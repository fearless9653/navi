/** HTML 字节按声明的 charset 解码；至少覆盖 UTF-8 与 GBK/GB2312。 */
import { decodeGbk } from './gbk';

const META_SCAN_BYTES = 4096;
const GBK_LABELS = new Set([
  'gbk',
  'gb2312',
  'gb_2312',
  'gb2312-80',
  'gb_2312-80',
  'csgb2312',
  'x-gbk',
  'gbk-2312',
  'cp936',
  'windows-936',
  'ms936',
  'chinese',
  'csgb2312',
]);

function normalizeCharset(label: string): string {
  const l = label.trim().toLowerCase().replace(/[_]/g, '-');
  if (l === 'utf8' || l === 'utf-8' || l === 'unicode-1-1-utf-8') return 'utf-8';
  if (l === 'utf-16' || l === 'utf16') return 'utf-16le';
  if (l === 'utf-16be' || l === 'utf16be') return 'utf-16be';
  if (l === 'utf-16le' || l === 'utf16le') return 'utf-16le';
  if (l === 'iso-8859-1' || l === 'latin1' || l === 'latin-1') return 'iso-8859-1';
  if (l === 'gb18030') return 'gb18030';
  if (GBK_LABELS.has(l) || GBK_LABELS.has(l.replace(/-/g, ''))) return 'gbk';
  return l;
}

function isGbkFamily(label: string): boolean {
  return label === 'gbk' || label === 'gb18030' || GBK_LABELS.has(label);
}

const decoderSupported = new Map<string, boolean>();

function canTextDecode(label: string): boolean {
  const cached = decoderSupported.get(label);
  if (cached !== undefined) return cached;
  try {
    // 探活：不支持的编码会抛错。
    void new TextDecoder(label);
    decoderSupported.set(label, true);
    return true;
  } catch {
    decoderSupported.set(label, false);
    return false;
  }
}

/** 用指定编码解码；GBK 族在环境不支持时走自带表。 */
export function decodeBytes(bytes: Uint8Array, label: string): string {
  const enc = normalizeCharset(label);
  if (canTextDecode(enc)) return new TextDecoder(enc).decode(bytes);
  if (isGbkFamily(enc)) return decodeGbk(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

export function charsetFromContentType(contentType: string): string | null {
  const m = contentType.match(/charset\s*=\s*("?)([^";\s]+)\1/i);
  return m?.[2] ? m[2] : null;
}

function charsetFromMeta(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, META_SCAN_BYTES));
  const charsetAttr = head.match(/<meta\b[^>]*\bcharset\s*=\s*("|'|)([^"'>\s/]+)/i);
  if (charsetAttr?.[2]) return charsetAttr[2];
  const metaRe = /<meta\b[^>]*>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = metaRe.exec(head))) {
    const tag = mm[0];
    const http = /http-equiv\s*=\s*("|'|)content-type\1/i.test(tag);
    if (!http) continue;
    const content = tag.match(/content\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/i);
    const raw = content?.[2] ?? content?.[3] ?? content?.[4] ?? '';
    const cs = charsetFromContentType(raw);
    if (cs) return cs;
  }
  return null;
}

function charsetFromBom(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  return null;
}

/**
 * 按 BOM、Content-Type、页面 meta 依次判定编码，缺省 UTF-8。
 */
export function decodeHtmlBytes(bytes: Uint8Array, contentType = ''): string {
  const label = charsetFromBom(bytes) ?? charsetFromContentType(contentType) ?? charsetFromMeta(bytes) ?? 'utf-8';
  return decodeBytes(bytes, label);
}
