import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { schema } from './schema';

/** 具体的 better-sqlite3 实例类型（用于构造 / 迁移 / 测试，保持同步语义）。 */
export type NodeDB = BetterSQLite3Database<typeof schema>;

/** 具体的 D1 实例类型（Workers 运行时）。 */
export type D1DB = DrizzleD1Database<typeof schema>;

/**
 * 运行时无关的 DB 类型：同时容纳 better-sqlite3（同步）与 D1（异步）。
 * 所有 service 对此编程并 `await` 每个查询；原子写经 runWrite。
 * NodeDB 可赋给 DB（具体 → 放宽），故 createNodeDb/createTestDb 返回 NodeDB 即可传入 service。
 */
export type DB = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>;

/** 用 better-sqlite3 创建 Drizzle 实例（Node / Docker 运行时）。 */
export function createNodeDb(filename: string): NodeDB {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  return drizzle(sqlite, { schema });
}

/** 用 D1 创建 Drizzle 实例（Cloudflare Workers 运行时）。 */
export function createD1Db(d1: import('@cloudflare/workers-types').D1Database): D1DB {
  return drizzleD1(d1, { schema });
}
