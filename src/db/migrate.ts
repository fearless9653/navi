import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { NodeDB } from './client';

// 用 fileURLToPath 而非 URL.pathname：Windows 上 pathname 会带前导 "/D:/" 导致 fs 出错。
export function getMigrationsFolder(): string {
  const candidates = [
    fileURLToPath(new URL('./migrations/', import.meta.url)),
    fileURLToPath(new URL('../migrations/', import.meta.url)),
  ] as const;
  const found = candidates.find((path) => existsSync(path));
  return found || candidates[0];
}

/**
 * 在给定 db 上应用所有迁移（Node 启动时 / 测试中调用）。
 * 注意：数据回填/数据修正必须写成 SQL 迁移（`drizzle-kit generate --custom`），
 * 禁止写在这里——本函数只在 Node 侧执行，代码回填在 D1 侧会静默缺失。
 */
export function runMigrations(db: NodeDB): void {
  migrate(db, { migrationsFolder: getMigrationsFolder() });
}
