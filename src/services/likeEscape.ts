/**
 * 把用户输入转义为安全的 LIKE 子串模式。
 * - 转义 LIKE 元字符 `\ % _`（配合 SQL 端 `escape '\'` 使用）
 * - 整体转小写，使 ASCII 大小写不敏感（CJK 无大小写，原样保留）
 * - 两端加 `%`，做子串匹配
 */
export function likePattern(input: string): string {
  const escaped = input.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}
