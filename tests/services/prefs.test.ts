import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users } from '@/db/schema';
import { getPrefs, updatePrefs } from '@/services/prefs';
import { importData } from '@/services/transfer';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

describe('prefs service', () => {
  it('getPrefs 缺失时懒建默认', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const p = await getPrefs(db, u);
    expect(p.recentCount).toBe(8);
    expect(p.pageSize).toBe(24);
    expect(p.defaultSort).toBe('created');
    expect(p.slogan).toBeNull();
  });

  it('updatePrefs 改字段', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const p = await updatePrefs(db, u, { recentCount: 12, pageSize: 50, defaultSort: 'recent' });
    expect(p.recentCount).toBe(12);
    expect(p.pageSize).toBe(50);
    expect(p.defaultSort).toBe('recent');
  });

  it('getPrefs 缓存同一用户偏好读取', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');

    const originalSelect = db.select.bind(db);
    let selectCalls = 0;
    db.select = ((...args: Parameters<typeof db.select>) => {
      selectCalls += 1;
      return originalSelect(...args);
    }) as typeof db.select;

    const first = await getPrefs(db, u);
    const callsAfterFirst = selectCalls;
    const second = await getPrefs(db, u);

    expect(first).toEqual(second);
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(selectCalls).toBe(callsAfterFirst);
  });

  it('updatePrefs 和 importData 后失效偏好缓存', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');

    expect((await getPrefs(db, u)).pageSize).toBe(24);

    await updatePrefs(db, u, { pageSize: 50 });
    expect((await getPrefs(db, u)).pageSize).toBe(50);

    await importData(db, u, {
      mode: 'merge',
      data: {
        prefs: {
          recentCount: 8,
          pageSize: 12,
          defaultSort: 'name',
        },
      },
    });
    expect((await getPrefs(db, u)).pageSize).toBe(12);
    expect((await getPrefs(db, u)).defaultSort).toBe('name');
  });

  it('updatePrefs 保存和清空个人标语', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');

    let p = await updatePrefs(db, u, { slogan: '把时间留给热爱的事。' });
    expect(p.slogan).toBe('把时间留给热爱的事。');

    p = await updatePrefs(db, u, { slogan: null });
    expect(p.slogan).toBeNull();
  });

  it('隔离：各用户偏好独立', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    await updatePrefs(db, a, { pageSize: 99 });
    expect((await getPrefs(db, b)).pageSize).toBe(24);
  });
});
