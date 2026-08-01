/**
 * D1 单条 SQL 语句的绑定参数上限（保守取值，低于 D1 文档上限）。
 * better-sqlite3 上限约 3.2 万，D1 远低于此；未分片的 `inArray(...)` / 多行 `insert` 在 Node 测试通过、
 * 在 Workers 上会因超限 500。所有把「用户可控数量的 id/行」放进单条语句的地方都要按此分片。
 */
export const MAX_SQL_PARAMS = 90;

/** 把数组切成每片至多 size 个元素（默认 MAX_SQL_PARAMS）。空数组返回 []。 */
export function chunk<T>(arr: readonly T[], size: number = MAX_SQL_PARAMS): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
