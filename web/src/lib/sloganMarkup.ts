// 标语行内标记解析。
//
// 支持四类前后包裹标记：加粗 <b>..</b>、斜体 <i>..</i>、删除线 <s>..</s>、
// 颜色 <c=#e53935>..</c> 或 <c=red>..</c>。大小写不敏感、可嵌套。
//
// 设计要点：未闭合 / 不匹配 / 非法颜色的标记一律**原样降级为字面文字**，
// 绝不吞掉用户内容。颜色值仅接受十六进制（#rgb / #rrggbb / #rrggbbaa）与一个
// 精选颜色名白名单；非法值保留内文但丢弃颜色。

export type SloganSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  color: string | null; // null 表示继承父级颜色
};

type StyleKind = 'bold' | 'italic' | 'strike' | 'color';

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'open'; target: StyleKind; raw: string; color: string | null; valid: boolean }
  | { kind: 'close'; target: StyleKind; raw: string; valid: boolean };

type OpenTag = Extract<Token, { kind: 'open' }>;

const LETTER: Record<string, StyleKind> = {
  b: 'bold',
  i: 'italic',
  s: 'strike',
  c: 'color',
};

/** 单一正则匹配四类标记：close </b|i|s|c>、open <b|i|s>、颜色 <c=值>。 */
const TAG_RE = /<\/(b|i|s|c)>|<(b|i|s)>|<c=([^>]*)>/giu;

/** 十六进制颜色：#rgb / #rrggbb / #rrggbbaa。 */
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** 精选颜色名白名单（非全量 CSS 命名色，避免在半透明首页底上花哨）。 */
const COLOR_NAMES = new Set([
  'red',
  'orange',
  'yellow',
  'olive',
  'green',
  'teal',
  'cyan',
  'blue',
  'purple',
  'pink',
  'brown',
  'gold',
  'gray',
  'grey',
  'black',
  'white',
]);

/** 把标记字母映射为目标样式；正则保证 letter ∈ b|i|s|c（大小写不敏感），否则兜底为 color。 */
function targetOf(letter: string | undefined): StyleKind {
  if (letter === undefined) return 'color';
  return LETTER[letter.toLowerCase()] ?? 'color';
}

/** 校验颜色值：合法返回归一化（小写）值，非法返回 null（=丢弃颜色、保留内文）。 */
function validateColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (HEX_RE.test(v)) return v;
  if (COLOR_NAMES.has(v)) return v;
  return null;
}

/** 把原文切成 text / open / close token 序列（valid 暂置 false，留待标注阶段）。 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const matched = m[0] as string;
    if (m.index > last) tokens.push({ kind: 'text', text: text.slice(last, m.index) });
    const ch = matched[1];
    if (ch === '/') {
      tokens.push({ kind: 'close', target: targetOf(matched[2]), raw: matched, valid: false });
    } else if (ch === 'c' || ch === 'C') {
      // <c=VALUE>：去掉前缀「<c=」(3) 与结尾「>」
      tokens.push({
        kind: 'open',
        target: 'color',
        raw: matched,
        color: validateColor(matched.slice(3, -1)),
        valid: false,
      });
    } else {
      tokens.push({ kind: 'open', target: targetOf(ch), raw: matched, color: null, valid: false });
    }
    last = m.index + matched.length;
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  return tokens;
}

/**
 * 解析标语标记，输出结构化段落数组，供模板 v-for 渲染为带样式的 <span>。
 *
 * 用途是 XSS 安全的富文本渲染：文字只经 Vue 文本插值输出，样式经白名单校验后
 * 绑定到 :style，全程不碰 innerHTML / v-html。
 *
 * 算法分两阶段：先严格栈顶匹配标注每个 open/close 是否配对成功（未闭合的 open、
 * 无匹配的 close 为 invalid），再线性生成段落——invalid 标记的原始字面量回填进
 * 文本缓冲，原位保留，故用户内容不可能凭空消失。
 */
export function parseSlogan(text: string): SloganSegment[] {
  const tokens = tokenize(text);

  // 阶段一：严格栈顶匹配。
  const stack: OpenTag[] = [];
  for (const tk of tokens) {
    if (tk.kind === 'text') continue;
    if (tk.kind === 'open') {
      stack.push(tk);
    } else {
      const top = stack[stack.length - 1];
      if (top && top.target === tk.target) {
        top.valid = true;
        tk.valid = true;
        stack.pop();
      }
      // 否则 tk.valid 维持初始 false（无匹配 close → 字面文字）
    }
  }
  // 栈上剩余 open 的 valid 维持初始 false（未闭合 → 字面文字）

  // 阶段二：线性生成段落。
  const segs: SloganSegment[] = [];
  let buf = '';
  const st = { bold: false, italic: false, strike: false, color: null as string | null };
  const flush = (): void => {
    if (buf) {
      segs.push({
        text: buf,
        bold: st.bold,
        italic: st.italic,
        strike: st.strike,
        color: st.color,
      });
      buf = '';
    }
  };
  for (const tk of tokens) {
    if (tk.kind === 'text') {
      buf += tk.text;
    } else if (tk.kind === 'open') {
      if (!tk.valid) {
        buf += tk.raw;
        continue;
      }
      flush();
      if (tk.target === 'bold') st.bold = true;
      else if (tk.target === 'italic') st.italic = true;
      else if (tk.target === 'strike') st.strike = true;
      else st.color = tk.color;
    } else {
      if (!tk.valid) {
        buf += tk.raw;
        continue;
      }
      flush();
      if (tk.target === 'bold') st.bold = false;
      else if (tk.target === 'italic') st.italic = false;
      else if (tk.target === 'strike') st.strike = false;
      else st.color = null;
    }
  }
  flush();
  return segs;
}

/**
 * 剥离标记，返回用户实际看到的纯文本，用于标语字数计数（标记不计入限额）。
 *
 * **刻意复用 parseSlogan**：计数器与渲染器必须对「什么算一个标记」达成一致——
 * 例如未闭合的 <b> 在渲染时是字面文字，这里也必须计入字数。禁止改成独立正则
 * 替换，否则两端会在边界情况上漂移。
 */
export function stripSloganMarkup(text: string): string {
  return parseSlogan(text)
    .map((s) => s.text)
    .join('');
}
