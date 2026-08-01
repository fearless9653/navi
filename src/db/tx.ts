import type { DB, NodeDB } from './client';

/** 一条可放入 batch / 事务的写语句（drizzle 的 insert/update/delete 构建器）。 */
export interface WriteStatement {
  run: () => unknown;
}

/**
 * 可移植原子写：一次执行一组写语句。
 * - D1：用 `db.batch([...])` 原子执行。
 * - Node/better-sqlite3：同步事务内逐条 `.run()`（语句绑定同一连接，处于 BEGIN/COMMIT 内，出错回滚）。
 *
 * 仅适用于「纯写、无需在中途读取自增 id 喂给后续语句」的场景；需链式 id 的操作（建号/建网址/导入建层级）
 * 改为顺序 await（D1 无交互式事务，非严格原子，已记录在案）。
 */
export async function runWrite(db: DB, statements: WriteStatement[]): Promise<void> {
  if (statements.length === 0) return;
  const maybeBatch = db as unknown as {
    batch?: (s: [WriteStatement, ...WriteStatement[]]) => Promise<unknown>;
  };
  if (typeof maybeBatch.batch === 'function') {
    await maybeBatch.batch(statements as [WriteStatement, ...WriteStatement[]]);
    return;
  }
  (db as unknown as NodeDB).transaction(() => {
    for (const s of statements) s.run();
  });
}
