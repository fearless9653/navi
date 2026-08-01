import { describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users, bookmarks, bookmarkTags } from '@/db/schema';
import { createTag } from '@/services/tags';
import { createBookmark, getBookmark, updateBookmark, deleteBookmark } from '@/services/bookmarks';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

describe('bookmarks service', () => {
  it('新建网址未指定权重时默认使用 100', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');

    const bm = await createBookmark(db, u, { url: 'https://e.com', name: 'E' });

    expect(bm.weight).toBe(100);
  });

  it('数据库缺省插入网址时权重默认为 100', () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');

    db.run(sql`insert into bookmarks (user_id, url, name) values (${u}, 'https://db.com', 'DB')`);

    expect(db.select().from(bookmarks).get()!.weight).toBe(100);
  });

  it('建网址带 tagIds，get 能取回带标签', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const t1 = await createTag(db, u, { name: 't1' });
    const t2 = await createTag(db, u, { name: 't2' });
    const bm = await createBookmark(db, u, {
      url: 'https://e.com',
      name: 'E',
      tagIds: [t1.id, t2.id],
    });
    const got = await getBookmark(db, u, bm.id);
    expect(got!.name).toBe('E');
    expect(got!.tags.map((t) => t.name).sort()).toEqual(['t1', 't2']);
  });

  it('同用户重复 url 被拒', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await createBookmark(db, u, { url: 'https://e.com', name: 'E' });
    await expect(createBookmark(db, u, { url: 'https://e.com', name: 'E2' })).rejects.toThrow();
  });

  it('建网址时混入他人 tagId 被过滤', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    const bTag = await createTag(db, b, { name: 'foreign' });
    const bm = await createBookmark(db, a, {
      url: 'https://e.com',
      name: 'E',
      tagIds: [bTag.id],
    });
    const got = await getBookmark(db, a, bm.id);
    expect(got!.tags).toEqual([]);
  });

  it('update 改字段并整体替换标签', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const t1 = await createTag(db, u, { name: 't1' });
    const t2 = await createTag(db, u, { name: 't2' });
    const bm = await createBookmark(db, u, { url: 'https://e.com', name: 'E', tagIds: [t1.id] });
    await updateBookmark(db, u, bm.id, { name: 'E2', weight: 5, tagIds: [t2.id] });
    const got = await getBookmark(db, u, bm.id);
    expect(got!.name).toBe('E2');
    expect(got!.weight).toBe(5);
    expect(got!.tags.map((t) => t.name)).toEqual(['t2']);
  });

  it('delete 删本体与关联', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const t1 = await createTag(db, u, { name: 't1' });
    const bm = await createBookmark(db, u, { url: 'https://e.com', name: 'E', tagIds: [t1.id] });
    await deleteBookmark(db, u, bm.id);
    expect(await getBookmark(db, u, bm.id)).toBeNull();
    expect(db.select().from(bookmarkTags).all().length).toBe(0);
  });

  it('跨用户隔离：A 不能 get/update/delete B 的书签', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    const bm = await createBookmark(db, b, { url: 'https://e.com', name: 'B-secret' });

    expect(await getBookmark(db, a, bm.id)).toBeNull();
    await updateBookmark(db, a, bm.id, { name: 'hacked' });
    expect((await getBookmark(db, b, bm.id))!.name).toBe('B-secret');
    await deleteBookmark(db, a, bm.id);
    expect(await getBookmark(db, b, bm.id)).not.toBeNull();
  });
});
