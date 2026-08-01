import { eq, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { bookmarks, tags, searchEngines } from '@/db/schema';

/**
 * 每用户资源数量上限。「防小人不防君子」：数值取得足够高，
 * 正常（含重度）用户一辈子碰不到，仅用于挡脚本化的大批量刷库。
 * 集中在此便于统一调整；刻意不做成环境变量（无按部署调优的真实需求）。
 */
export const LIMITS = {
  bookmarks: 10_000,
  tags: 1_000,
  engines: 100,
} as const;

export type LimitedResource = keyof typeof LIMITS;

/** 超过资源数量上限时抛出；路由层据此返回 409 + { error, resource, limit }。 */
export class LimitExceededError extends Error {
  constructor(
    readonly resource: LimitedResource,
    readonly limit: number,
  ) {
    super(`limit_exceeded:${resource}`);
    this.name = 'LimitExceededError';
  }
}

const tableFor = {
  bookmarks,
  tags,
  engines: searchEngines,
} as const;

/** 统计某用户某资源现有行数（userId 均有索引，成本可忽略）。 */
export async function countResource(
  db: DB,
  userId: number,
  resource: LimitedResource,
): Promise<number> {
  const table = tableFor[resource];
  const row = await db
    .select({ c: sql<number>`count(*)` })
    .from(table)
    .where(eq(table.userId, userId))
    .get();
  return row?.c ?? 0;
}

/**
 * 断言再新增 `adding` 条不会超过上限，否则抛 LimitExceededError。
 * adding 默认 1（单条创建）；导入等批量场景传入本次净增量。
 */
export async function assertWithinLimit(
  db: DB,
  userId: number,
  resource: LimitedResource,
  adding = 1,
): Promise<void> {
  const limit = LIMITS[resource];
  const current = await countResource(db, userId, resource);
  if (current + adding > limit) throw new LimitExceededError(resource, limit);
}

/**
 * 断言已算出的最终行数不超过上限，否则抛 LimitExceededError。
 * 供导入等已自行算出终态（含 replace 清空后重建）的场景使用，
 * 不再查实时行数——replace 模式下旧行即将被清空，实时计数无意义。
 */
export function assertCountWithinLimit(resource: LimitedResource, finalCount: number): void {
  const limit = LIMITS[resource];
  if (finalCount > limit) throw new LimitExceededError(resource, limit);
}
