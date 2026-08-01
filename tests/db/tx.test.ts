import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import { runWrite } from '@/db/tx';
import { users } from '@/db/schema';

describe('runWrite', () => {
  it('成功时提交全部语句', async () => {
    const db = createTestDb();
    await runWrite(db, [
      db.insert(users).values({ email: 'a@x.com', passwordHash: 'x', displayName: 'A' }),
      db.insert(users).values({ email: 'b@x.com', passwordHash: 'x', displayName: 'B' }),
    ]);
    expect(db.select().from(users).all().length).toBe(2);
  });

  it('某条失败时整体回滚（Node 事务原子性）', async () => {
    const db = createTestDb();
    await expect(
      runWrite(db, [
        db.insert(users).values({ email: 'dup@x.com', passwordHash: 'x', displayName: 'A' }),
        // 同邮箱触发唯一约束冲突 → 整批回滚
        db.insert(users).values({ email: 'dup@x.com', passwordHash: 'x', displayName: 'B' }),
      ]),
    ).rejects.toThrow();
    expect(db.select().from(users).all().length).toBe(0);
  });

  it('空语句数组为 no-op', async () => {
    const db = createTestDb();
    await runWrite(db, []);
    expect(db.select().from(users).where(eq(users.email, 'none@x.com')).get()).toBeUndefined();
  });
});
