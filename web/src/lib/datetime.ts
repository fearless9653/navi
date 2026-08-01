// 日期格式化工具。

/** 将 ISO 8601 字符串（如 2026-06-16T03:15:07.000Z）格式化为 yyyy-MM-dd（本地时区），仅保留到日。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
