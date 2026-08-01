import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users } from '@/db/schema';
import { createTag } from '@/services/tags';
import { createBookmark, listBookmarks, listTops, recordVisit } from '@/services/bookmarks';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

/** A：技术>python、阅读；4 个书签覆盖各种标签组合与权重。 */
async function fixture(db: NodeDB) {
  const a = seedUser(db, 'a@x.com');
  const tech = await createTag(db, a, { name: '技术' });
  const py = await createTag(db, a, { name: 'python', parentId: tech.id });
  const read = await createTag(db, a, { name: '阅读' });

  await createBookmark(db, a, {
    url: 'https://dj.com',
    name: 'Django site',
    weight: 10,
    tagIds: [py.id],
  });
  await createBookmark(db, a, {
    url: 'https://np.com',
    name: 'Numpy',
    weight: 5,
    tagIds: [py.id, read.id],
  });
  await createBookmark(db, a, {
    url: 'https://novel.com',
    name: 'Novel',
    weight: 1,
    tagIds: [read.id],
  });
  await createBookmark(db, a, { url: 'https://zhihu.com', name: 'Orphan 知乎', weight: 8 });
  return { a, tech, py, read };
}

describe('listBookmarks', () => {
  it('无过滤返回全部', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const res = await listBookmarks(db, a, {});
    expect(res.total).toBe(4);
    expect(res.items.length).toBe(4);
  });

  it('默认只返回启用的网址，status=all 返回全部，status=inactive 只返回弃用', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const hidden = await createBookmark(db, a, {
      url: 'https://hidden.com',
      name: 'Hidden',
      isActive: false,
    });

    const active = await listBookmarks(db, a, {});
    expect(active.items.map((b) => b.id)).not.toContain(hidden.id);
    expect(active.total).toBe(4);

    const all = await listBookmarks(db, a, { status: 'all' });
    expect(all.items.map((b) => b.id)).toContain(hidden.id);
    expect(all.total).toBe(5);

    const inactive = await listBookmarks(db, a, { status: 'inactive' });
    expect(inactive.items.map((b) => b.name)).toEqual(['Hidden']);
  });

  it('选父标签命中挂在子标签上的书签（父含子）', async () => {
    const db = createTestDb();
    const { a, tech } = await fixture(db);
    const res = await listBookmarks(db, a, { tagIds: [tech.id] });
    expect(res.items.map((b) => b.name).sort()).toEqual(['Django site', 'Numpy']);
  });

  it('多选标签取交集', async () => {
    const db = createTestDb();
    const { a, tech, read } = await fixture(db);
    const res = await listBookmarks(db, a, { tagIds: [tech.id, read.id] });
    expect(res.items.map((b) => b.name)).toEqual(['Numpy']);
  });

  it('query 在标签范围内进一步收窄', async () => {
    const db = createTestDb();
    const { a, read } = await fixture(db);
    const res = await listBookmarks(db, a, { tagIds: [read.id], query: 'novel' });
    expect(res.items.map((b) => b.name)).toEqual(['Novel']);
  });

  it('query 支持中文 2 字子串', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const res = await listBookmarks(db, a, { query: '知乎' });
    expect(res.items.map((b) => b.name)).toEqual(['Orphan 知乎']);
  });

  it('sort=weight 倒序', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const res = await listBookmarks(db, a, { sort: 'weight' });
    expect(res.items.map((b) => b.name)).toEqual(['Django site', 'Orphan 知乎', 'Numpy', 'Novel']);
  });

  it('sort=visits 按访问次数倒序，同次数按名称', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const byName = new Map((await listBookmarks(db, a, {})).items.map((b) => [b.name, b.id]));
    // Novel 访问 2 次，Numpy 1 次，其余 0 次（同为 0 → 按名称升序）
    await recordVisit(db, a, byName.get('Novel')!);
    await recordVisit(db, a, byName.get('Novel')!);
    await recordVisit(db, a, byName.get('Numpy')!);

    const res = await listBookmarks(db, a, { sort: 'visits' });
    expect(res.items.map((b) => b.name)).toEqual(['Novel', 'Numpy', 'Django site', 'Orphan 知乎']);

    const asc = await listBookmarks(db, a, { sort: 'visits', dir: 'asc' });
    expect(asc.items.map((b) => b.name)).toEqual(['Django site', 'Orphan 知乎', 'Numpy', 'Novel']);
  });

  it('分页返回正确切片与 total', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const res = await listBookmarks(db, a, { sort: 'weight', page: 2, pageSize: 2 });
    expect(res.total).toBe(4);
    expect(res.page).toBe(2);
    expect(res.items.map((b) => b.name)).toEqual(['Numpy', 'Novel']);
  });

  it('隔离：A 的查询不返回 B 的书签', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const b = seedUser(db, 'b@x.com');
    await createBookmark(db, b, { url: 'https://secret.com', name: 'B-secret' });
    const res = await listBookmarks(db, a, {});
    expect(res.total).toBe(4);
    expect(res.items.some((x) => x.name === 'B-secret')).toBe(false);
  });
});

describe('listTops', () => {
  it('visits 榜：仅 visitCount>0，按次数倒序、同次数按名称升序', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    const byName = new Map((await listBookmarks(db, a, {})).items.map((b) => [b.name, b.id]));
    await recordVisit(db, a, byName.get('Novel')!);
    await recordVisit(db, a, byName.get('Novel')!);
    await recordVisit(db, a, byName.get('Numpy')!);
    await recordVisit(db, a, byName.get('Django site')!);

    const { visits } = await listTops(db, a, 10);
    // 未访问过的（visitCount=0）不进榜；Numpy/Django 同为 1 次 → 名称升序。
    expect(visits.map((b) => b.name)).toEqual(['Novel', 'Django site', 'Numpy']);
    // 精简字段：只含 id/url/name/faviconUrl。
    expect(Object.keys(visits[0]!).sort()).toEqual(['faviconUrl', 'id', 'name', 'url']);
  });

  it('weight 榜：仅 weight≠0（负值沉底）；created 榜：不过滤、新→旧', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    await createBookmark(db, a, { url: 'https://zero.com', name: 'Zero', weight: 0 });
    await createBookmark(db, a, { url: 'https://neg.com', name: 'Neg', weight: -2 });

    const { weight, created } = await listTops(db, a, 10);
    expect(weight.map((b) => b.name)).toEqual([
      'Django site',
      'Orphan 知乎',
      'Numpy',
      'Novel',
      'Neg',
    ]);
    // created 同秒时间戳靠 id desc 兜底 → 恰为插入逆序，weight=0 的也在内。
    expect(created.map((b) => b.name)).toEqual([
      'Neg',
      'Zero',
      'Orphan 知乎',
      'Novel',
      'Numpy',
      'Django site',
    ]);
  });

  it('弃用与他人书签不进任何榜；limit 生效', async () => {
    const db = createTestDb();
    const { a } = await fixture(db);
    await createBookmark(db, a, {
      url: 'https://off.com',
      name: 'Off',
      weight: 99,
      isActive: false,
    });
    const b = seedUser(db, 'b@x.com');
    await createBookmark(db, b, { url: 'https://secret.com', name: 'B-secret', weight: 100 });

    const tops = await listTops(db, a, 2);
    const names = [...tops.visits, ...tops.weight, ...tops.created].map((x) => x.name);
    expect(names).not.toContain('Off');
    expect(names).not.toContain('B-secret');
    expect(tops.weight.map((x) => x.name)).toEqual(['Django site', 'Orphan 知乎']);
    expect(tops.created.length).toBe(2);
  });
});
