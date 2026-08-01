import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users } from '@/db/schema';
import {
  createBookmark,
  getBookmark,
  recordVisit,
  listRecent,
  clearRecent,
  clearRecentOne,
} from '@/services/bookmarks';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

const T1 = new Date(1000);
const T2 = new Date(2000);
const T3 = new Date(3000);

describe('recent / visit', () => {
  it('record 设置访问时间并自增计数', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const bm = await createBookmark(db, u, { url: 'https://e.com', name: 'E' });
    await recordVisit(db, u, bm.id, T1);
    let got = await getBookmark(db, u, bm.id);
    expect(got!.visitCount).toBe(1);
    expect(got!.lastVisitedAt?.getTime()).toBe(T1.getTime());
    await recordVisit(db, u, bm.id, T2);
    got = await getBookmark(db, u, bm.id);
    expect(got!.visitCount).toBe(2);
    expect(got!.lastVisitedAt?.getTime()).toBe(T2.getTime());
  });

  it('recent 倒序、限量、仅含已访问', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const b1 = await createBookmark(db, u, { url: 'https://1.com', name: 'B1' });
    const b2 = await createBookmark(db, u, { url: 'https://2.com', name: 'B2' });
    const b3 = await createBookmark(db, u, { url: 'https://3.com', name: 'B3' });
    await createBookmark(db, u, { url: 'https://4.com', name: 'B4-unvisited' });
    await recordVisit(db, u, b1.id, T1);
    await recordVisit(db, u, b2.id, T2);
    await recordVisit(db, u, b3.id, T3);

    const recent = await listRecent(db, u, 2);
    expect(recent.map((b) => b.name)).toEqual(['B3', 'B2']);
  });

  it('recent 隐藏弃用网址，recordVisit 不更新弃用网址', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const active = await createBookmark(db, u, { url: 'https://active.com', name: 'Active' });
    const inactive = await createBookmark(db, u, {
      url: 'https://inactive.com',
      name: 'Inactive',
      isActive: false,
    });

    await recordVisit(db, u, active.id, T1);
    await recordVisit(db, u, inactive.id, T2);

    expect((await listRecent(db, u, 8)).map((b) => b.name)).toEqual(['Active']);
    const got = await getBookmark(db, u, inactive.id);
    expect(got!.visitCount).toBe(0);
    expect(got!.lastVisitedAt).toBeNull();
  });

  it('clear 后 recent 为空，书签本体仍在', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const bm = await createBookmark(db, u, { url: 'https://e.com', name: 'E' });
    await recordVisit(db, u, bm.id, T1);
    await clearRecent(db, u);
    expect(await listRecent(db, u, 8)).toEqual([]);
    expect(await getBookmark(db, u, bm.id)).not.toBeNull();
  });

  it('clearOne 仅移除指定项，其余 recent 不受影响', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const b1 = await createBookmark(db, u, { url: 'https://1.com', name: 'B1' });
    const b2 = await createBookmark(db, u, { url: 'https://2.com', name: 'B2' });
    await recordVisit(db, u, b1.id, T1);
    await recordVisit(db, u, b2.id, T2);
    await clearRecentOne(db, u, b2.id);
    expect((await listRecent(db, u, 8)).map((b) => b.name)).toEqual(['B1']);
    // 书签本体与访问计数仍在
    const got = await getBookmark(db, u, b2.id);
    expect(got).not.toBeNull();
    expect(got!.visitCount).toBe(1);
  });

  it('clearOne 隔离：不能移除他人书签的 recent', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    const bBm = await createBookmark(db, b, { url: 'https://b.com', name: 'B-bm' });
    await recordVisit(db, b, bBm.id, T1);
    await clearRecentOne(db, a, bBm.id); // 越权，无效
    expect((await getBookmark(db, b, bBm.id))!.lastVisitedAt?.getTime()).toBe(T1.getTime());
  });

  it('隔离：record 他人书签无效；recent 不含他人', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    const bBm = await createBookmark(db, b, { url: 'https://b.com', name: 'B-bm' });
    await recordVisit(db, a, bBm.id, T1); // 越权，无效
    expect((await getBookmark(db, b, bBm.id))!.lastVisitedAt).toBeNull();
    expect(await listRecent(db, a, 8)).toEqual([]);
  });
});
