import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users } from '@/db/schema';
import { createBookmark, recordVisit, getBookmark } from '@/services/bookmarks';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

describe('recordVisit', () => {
  it('访问只更新 lastVisitedAt/visitCount，不改 lastModifiedDate（避免污染「最近修改」排序）', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const bm = await createBookmark(db, u, { url: 'https://e.com', name: 'E' });
    const before = await getBookmark(db, u, bm.id);
    const originalModified = before!.lastModifiedDate.getTime();

    // 访问时间取明显更晚的时刻。
    const later = new Date(originalModified + 60_000);
    await recordVisit(db, u, bm.id, later);

    const after = await getBookmark(db, u, bm.id);
    expect(after!.visitCount).toBe(1);
    expect(after!.lastVisitedAt?.getTime()).toBe(later.getTime());
    expect(after!.lastModifiedDate.getTime()).toBe(originalModified);
  });
});
