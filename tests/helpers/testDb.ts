import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { schema } from '@/db/schema';
import type { NodeDB } from '@/db/client';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../src/db/migrations/', import.meta.url));

/** 内存 SQLite + 应用迁移，返回隔离的测试 db（具体 NodeDB 类型，保持同步语义）。 */
export function createTestDb(): NodeDB {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
