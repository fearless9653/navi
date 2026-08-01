import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users, bookmarks, bookmarkTags } from '@/db/schema';
import {
  listTags,
  listTagsByParent,
  getTag,
  createTag,
  updateTag,
  deleteTag,
  getTagSubtreeIds,
  expandTagIds,
} from '@/services/tags';
import { importData } from '@/services/transfer';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

function seedBookmark(db: NodeDB, userId: number, url: string): number {
  db.insert(bookmarks).values({ userId, url, name: url }).run();
  return db.select().from(bookmarks).where(eq(bookmarks.url, url)).get()!.id;
}

describe('tags service', () => {
  it('建根标签 path=name；建子标签 path=父/子', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const root = await createTag(db, u, { name: '技术' });
    expect(root.path).toBe('技术');
    expect(root.parentId).toBeNull();
    const child = await createTag(db, u, { name: 'python', parentId: root.id });
    expect(child.path).toBe('技术/python');
    expect(child.parentId).toBe(root.id);
  });

  it('name 含 / 被拒', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await expect(createTag(db, u, { name: 'a/b' })).rejects.toThrow();
  });

  it('同父同名（path 重复）被拒', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await createTag(db, u, { name: '技术' });
    await expect(createTag(db, u, { name: '技术' })).rejects.toThrow();
  });

  it('listTags 按 path 升序', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const tech = await createTag(db, u, { name: '技术' });
    await createTag(db, u, { name: '工具' });
    await createTag(db, u, { name: 'python', parentId: tech.id });
    const paths = (await listTags(db, u)).map((t) => t.path);
    expect(paths).toEqual(['工具', '技术', '技术/python']);
  });

  it('listTags 缓存同一用户全量标签读取', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await createTag(db, u, { name: '技术' });

    const originalSelect = db.select.bind(db);
    let selectCalls = 0;
    db.select = ((...args: Parameters<typeof db.select>) => {
      selectCalls += 1;
      return originalSelect(...args);
    }) as typeof db.select;

    const first = await listTags(db, u);
    const callsAfterFirst = selectCalls;
    const second = await listTags(db, u);

    expect(first).toEqual(second);
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(selectCalls).toBe(callsAfterFirst);
  });

  it('listTagsByParent 缓存同一用户同一父级的分层查询', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await createTag(db, u, { name: '技术' });

    const originalSelect = db.select.bind(db);
    let selectCalls = 0;
    db.select = ((...args: Parameters<typeof db.select>) => {
      selectCalls += 1;
      return originalSelect(...args);
    }) as typeof db.select;

    const first = await listTagsByParent(db, u, null);
    const callsAfterFirst = selectCalls;
    const second = await listTagsByParent(db, u, null);

    expect(first).toEqual(second);
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(selectCalls).toBe(callsAfterFirst);
  });

  it('标签写入后失效 listTagsByParent 缓存', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await createTag(db, u, { name: '技术' });

    expect((await listTagsByParent(db, u, null)).map((t) => t.name)).toEqual(['技术']);

    await createTag(db, u, { name: '工具' });

    expect((await listTagsByParent(db, u, null)).map((t) => t.name)).toEqual(['工具', '技术']);
  });

  it('标签更新和删除后失效 listTagsByParent 缓存', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const tech = await createTag(db, u, { name: '技术' });
    const py = await createTag(db, u, { name: 'python', parentId: tech.id });

    expect((await listTagsByParent(db, u, tech.id)).map((t) => t.name)).toEqual(['python']);

    await updateTag(db, u, py.id, { name: 'typescript' });
    expect((await listTagsByParent(db, u, tech.id)).map((t) => t.name)).toEqual(['typescript']);

    await deleteTag(db, u, py.id);
    expect(await listTagsByParent(db, u, tech.id)).toEqual([]);
  });

  it('importData 后失效标签全量和分层缓存', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    await createTag(db, u, { name: '旧标签' });

    expect((await listTags(db, u)).map((t) => t.path)).toEqual(['旧标签']);
    expect((await listTagsByParent(db, u, null)).map((t) => t.name)).toEqual(['旧标签']);

    await importData(db, u, {
      mode: 'replace',
      data: {
        tags: [{ path: '新标签' }, { path: '新标签/子标签' }],
      },
    });

    expect((await listTags(db, u)).map((t) => t.path)).toEqual(['新标签', '新标签/子标签']);
    expect((await listTagsByParent(db, u, null)).map((t) => t.name)).toEqual(['新标签']);
  });

  it('重命名父标签后，子树 path 前缀同步更新', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const a = await createTag(db, u, { name: '技术' });
    const b = await createTag(db, u, { name: 'python', parentId: a.id });
    const c = await createTag(db, u, { name: 'django', parentId: b.id });
    await updateTag(db, u, a.id, { name: '编程' });
    expect((await getTag(db, u, a.id))!.path).toBe('编程');
    expect((await getTag(db, u, b.id))!.path).toBe('编程/python');
    expect((await getTag(db, u, c.id))!.path).toBe('编程/python/django');
  });

  it('改父级（reparent）后子树 path 同步', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const tech = await createTag(db, u, { name: '技术' });
    const tools = await createTag(db, u, { name: '工具' });
    const py = await createTag(db, u, { name: 'python', parentId: tech.id });
    const dj = await createTag(db, u, { name: 'django', parentId: py.id });
    await updateTag(db, u, py.id, { parentId: tools.id });
    expect((await getTag(db, u, py.id))!.path).toBe('工具/python');
    expect((await getTag(db, u, dj.id))!.path).toBe('工具/python/django');
  });

  it('禁止把标签挂到自己的子树下（成环）', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const a = await createTag(db, u, { name: 'A' });
    const b = await createTag(db, u, { name: 'B', parentId: a.id });
    await expect(updateTag(db, u, a.id, { parentId: b.id })).rejects.toThrow();
  });

  it('deleteTag 删整棵子树并清除其 bookmark_tags', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const a = await createTag(db, u, { name: 'A' });
    const b = await createTag(db, u, { name: 'B', parentId: a.id });
    const bm = seedBookmark(db, u, 'https://e.com');
    db.insert(bookmarkTags).values({ bookmarkId: bm, tagId: b.id }).run();

    await deleteTag(db, u, a.id);
    expect(await getTag(db, u, a.id)).toBeNull();
    expect(await getTag(db, u, b.id)).toBeNull();
    expect(db.select().from(bookmarkTags).all().length).toBe(0);
  });

  it('getTagSubtreeIds 含自身与多层后代', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const a = await createTag(db, u, { name: 'A' });
    const b = await createTag(db, u, { name: 'B', parentId: a.id });
    const c = await createTag(db, u, { name: 'C', parentId: b.id });
    await createTag(db, u, { name: 'X' }); // 旁系，不应包含
    const ids = await getTagSubtreeIds(db, u, a.id);
    expect([...ids].sort((x, y) => x - y)).toEqual([a.id, b.id, c.id].sort((x, y) => x - y));
  });

  it('expandTagIds 为多个标签的子树并集（去重）', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const a = await createTag(db, u, { name: 'A' });
    const b = await createTag(db, u, { name: 'B', parentId: a.id });
    const x = await createTag(db, u, { name: 'X' });
    const ids = await expandTagIds(db, u, [a.id, x.id]);
    expect([...ids].sort((p, q) => p - q)).toEqual([a.id, b.id, x.id].sort((p, q) => p - q));
  });

  it('跨用户隔离：A 不能 get/update/delete B 的标签', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const bUser = seedUser(db, 'b@x.com');
    const bTag = await createTag(db, bUser, { name: 'secret' });

    expect(await getTag(db, a, bTag.id)).toBeNull();
    await updateTag(db, a, bTag.id, { name: 'hacked' }); // 无副作用
    expect((await getTag(db, bUser, bTag.id))!.name).toBe('secret');
    await deleteTag(db, a, bTag.id); // 无副作用
    expect(await getTag(db, bUser, bTag.id)).not.toBeNull();
  });
});
