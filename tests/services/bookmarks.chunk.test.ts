import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users, bookmarkTags } from '@/db/schema';
import { createTag } from '@/services/tags';
import {
  createBookmark,
  listBookmarks,
  bulkAssignTags,
  bulkRemoveTags,
  bulkDeleteBookmarks,
} from '@/services/bookmarks';
import { MAX_SQL_PARAMS } from '@/db/chunk';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

describe('bookmarks 大批量分片（D1 单查询参数上限）', () => {
  it('bulkAssignTags/bulkRemoveTags/bulkDeleteBookmarks 处理超上限批量且不丢行', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const tag = await createTag(db, u, { name: 't' });
    const n = MAX_SQL_PARAMS + 40; // 跨多个分片
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const bm = await createBookmark(db, u, { url: `https://e${i}.com`, name: `E${i}` });
      ids.push(bm.id);
    }

    await bulkAssignTags(db, u, ids, [tag.id]);
    expect(db.select().from(bookmarkTags).all().length).toBe(n);
    const filtered = await listBookmarks(db, u, { tagIds: [tag.id], pageSize: 100, page: 1 });
    expect(filtered.total).toBe(n);

    await bulkRemoveTags(db, u, ids, [tag.id]);
    expect(db.select().from(bookmarkTags).all().length).toBe(0);

    const deleted = await bulkDeleteBookmarks(db, u, ids);
    expect(deleted).toBe(n);
    const after = await listBookmarks(db, u, { status: 'all', pageSize: 100, page: 1 });
    expect(after.total).toBe(0);
  });
});

describe('按 path 前缀过滤子树', () => {
  it('命中自身与全部后代，且不误伤同级前缀 / 仅大小写不同的标签', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const a = await createTag(db, u, { name: 'a' }); // path a
    const ab = await createTag(db, u, { name: 'b', parentId: a.id }); // path a/b
    const abc = await createTag(db, u, { name: 'c', parentId: ab.id }); // path a/b/c
    const sibling = await createTag(db, u, { name: 'ab' }); // 前缀相邻，非子树
    const caseSib = await createTag(db, u, { name: 'A' }); // 仅大小写不同

    await createBookmark(db, u, { url: 'https://self.com', name: 'self', tagIds: [a.id] });
    await createBookmark(db, u, { url: 'https://deep.com', name: 'deep', tagIds: [abc.id] });
    await createBookmark(db, u, { url: 'https://sib.com', name: 'sib', tagIds: [sibling.id] });
    await createBookmark(db, u, { url: 'https://case.com', name: 'case', tagIds: [caseSib.id] });

    const res = await listBookmarks(db, u, { tagIds: [a.id], pageSize: 100, page: 1 });
    expect(res.items.map((b) => b.name).sort()).toEqual(['deep', 'self']);
  });

  it('全部为无效/越权标签时返回全部（既有语义保留）', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await createBookmark(db, u, { url: 'https://x.com', name: 'X' });
    const res = await listBookmarks(db, u, { tagIds: [99999], pageSize: 100, page: 1 });
    expect(res.total).toBe(1);
  });
});
