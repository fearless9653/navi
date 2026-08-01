import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users } from '@/db/schema';
import { createTag, getTag, bulkDeleteTags } from '@/services/tags';
import {
  createBookmark,
  getBookmark,
  listBookmarks,
  bulkDeleteBookmarks,
  bulkAssignTags,
  bulkRemoveTags,
} from '@/services/bookmarks';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

describe('bulk operations', () => {
  it('bulkDelete 只删自己的，返回计数，关联清除', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    const t = await createTag(db, a, { name: 't' });
    const b1 = await createBookmark(db, a, { url: 'https://1.com', name: 'B1', tagIds: [t.id] });
    const b2 = await createBookmark(db, a, { url: 'https://2.com', name: 'B2' });
    const bb = await createBookmark(db, b, { url: 'https://b.com', name: 'BB' });

    const n = await bulkDeleteBookmarks(db, a, [b1.id, b2.id, bb.id]); // 混入他人
    expect(n).toBe(2);
    expect(await getBookmark(db, a, b1.id)).toBeNull();
    expect(await getBookmark(db, b, bb.id)).not.toBeNull(); // 他人不受影响
    expect((await listBookmarks(db, a, {})).total).toBe(0);
  });

  it('bulkAssign 覆盖全部组合且幂等', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const t1 = await createTag(db, a, { name: 't1' });
    const t2 = await createTag(db, a, { name: 't2' });
    const b1 = await createBookmark(db, a, { url: 'https://1.com', name: 'B1' });
    const b2 = await createBookmark(db, a, { url: 'https://2.com', name: 'B2' });

    await bulkAssignTags(db, a, [b1.id, b2.id], [t1.id, t2.id]);
    await bulkAssignTags(db, a, [b1.id, b2.id], [t1.id, t2.id]); // 再来一次，应幂等

    expect((await getBookmark(db, a, b1.id))!.tags.map((t) => t.name).sort()).toEqual(['t1', 't2']);
    expect((await getBookmark(db, a, b2.id))!.tags.map((t) => t.name).sort()).toEqual(['t1', 't2']);
  });

  it('bulkRemove 移除指定关联', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const t1 = await createTag(db, a, { name: 't1' });
    const t2 = await createTag(db, a, { name: 't2' });
    const b1 = await createBookmark(db, a, {
      url: 'https://1.com',
      name: 'B1',
      tagIds: [t1.id, t2.id],
    });
    await bulkRemoveTags(db, a, [b1.id], [t1.id]);
    expect((await getBookmark(db, a, b1.id))!.tags.map((t) => t.name)).toEqual(['t2']);
  });

  it('bulkDeleteTags 级联删多个标签', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const p = await createTag(db, a, { name: 'p' });
    const c = await createTag(db, a, { name: 'c', parentId: p.id });
    const x = await createTag(db, a, { name: 'x' });
    await bulkDeleteTags(db, a, [p.id, x.id]);
    expect(await getTag(db, a, p.id)).toBeNull();
    expect(await getTag(db, a, c.id)).toBeNull(); // 子树
    expect(await getTag(db, a, x.id)).toBeNull();
  });

  it('隔离：bulkAssign 混入他人书签/标签不受影响', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    const aTag = await createTag(db, a, { name: 'a-tag' });
    const bBm = await createBookmark(db, b, { url: 'https://b.com', name: 'BB' });
    await bulkAssignTags(db, a, [bBm.id], [aTag.id]); // a 试图给 b 的书签打标签
    expect((await getBookmark(db, b, bBm.id))!.tags).toEqual([]);
  });
});
