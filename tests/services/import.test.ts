import { describe, it, expect } from 'vitest';
import { createApp } from '@/app';
import { createTestDb } from '../helpers/testDb';
import type { DB } from '@/db/client';
import { createUser } from '@/services/users';
import { createTag, listTags } from '@/services/tags';
import { createBookmark, listBookmarks } from '@/services/bookmarks';
import { exportData, importData } from '@/services/transfer';
import { listEngines } from '@/services/engines';
import { getPrefs } from '@/services/prefs';

async function newUser(db: DB, email: string): Promise<number> {
  return (await createUser(db, { email, password: 'password123', displayName: email })).id;
}

type App = ReturnType<typeof createApp>;
const ORIGIN = 'http://localhost';

function cookieFrom(res: Response): string {
  const m = (res.headers.get('set-cookie') ?? '').match(/navi_session=([^;]+)/);
  return m ? `navi_session=${m[1]}` : '';
}

function write(app: App, method: string, path: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function get(app: App, path: string, cookie?: string) {
  return app.request(path, { headers: cookie ? { Cookie: cookie } : {} });
}

async function setupAdmin(app: App): Promise<string> {
  const res = await write(app, 'POST', '/api/setup', {
    email: 'admin@x.com',
    password: 'pw123456',
    displayName: 'Admin',
  });
  return cookieFrom(res);
}

describe('importData', () => {
  it('非归一化 tagPaths（含前后斜杠）也能正确关联到标签', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    await importData(db, a, {
      mode: 'merge',
      data: { bookmarks: [{ url: 'https://e.com', name: 'E', tagPaths: ['/a/b/'] }] },
    });
    const list = await listBookmarks(db, a, { pageSize: 10, page: 1 });
    const bm = list.items.find((b) => b.url === 'https://e.com')!;
    expect(bm.tags.map((t) => t.path)).toEqual(['a/b']);
  });

  it('批量导入：跨分片的大量书签 + 标签关联正确、文件内重复 url 跳过', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    const n = 60; // 跨书签插入(每片~12)与关联插入(每片45)的分片边界
    const items = Array.from({ length: n }, (_, i) => ({
      url: `https://e${i}.com`,
      name: `E${i}`,
      tagPaths: ['g/child'],
    }));
    items.push({ url: 'https://e0.com', name: 'dup', tagPaths: [] }); // 文件内重复 url

    const result = await importData(db, a, { mode: 'merge', data: { bookmarks: items } });
    expect(result.bookmarksCreated).toBe(n);
    expect(result.bookmarksSkipped).toBe(1);

    const list = await listBookmarks(db, a, { pageSize: 100, page: 1 });
    expect(list.total).toBe(n);
    expect(list.items.every((b) => b.tags.some((t) => t.path === 'g/child'))).toBe(true);
  });

  it('merge：按 path 建标签层级、按 url 去重书签', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    await createBookmark(db, a, { url: 'https://dup.com', name: 'Existing' });

    const result = await importData(db, a, {
      mode: 'merge',
      data: {
        tags: [{ path: '技术/python' }],
        bookmarks: [
          { url: 'https://dup.com', name: 'Dup', tagPaths: [] }, // 重复 → 跳过
          { url: 'https://new.com', name: 'New', tagPaths: ['技术/python'] },
        ],
      },
    });

    expect(result.bookmarksCreated).toBe(1);
    expect(result.bookmarksSkipped).toBe(1);
    // 标签 技术 + 技术/python 都建出来
    expect((await listTags(db, a)).map((t) => t.path).sort()).toEqual(['技术', '技术/python']);
    // new.com 关联到 技术/python
    const list = await listBookmarks(db, a, {});
    const created = list.items.find((b) => b.url === 'https://new.com')!;
    expect(created.weight).toBe(100);
    expect(created.tags.map((t) => t.path)).toEqual(['技术/python']);
  });

  it('文件内重复 url：跳过而非撞唯一索引中途失败（merge 与 replace）', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');

    const dupData = {
      bookmarks: [
        { url: 'https://same.com', name: 'First' },
        { url: 'https://same.com', name: 'SecondDup' },
        { url: 'https://other.com', name: 'Other' },
      ],
    };

    const merged = await importData(db, a, { mode: 'merge', data: dupData });
    expect(merged.bookmarksCreated).toBe(2);
    expect(merged.bookmarksSkipped).toBe(1);

    const replaced = await importData(db, a, { mode: 'replace', data: dupData });
    expect(replaced.bookmarksCreated).toBe(2);
    expect(replaced.bookmarksSkipped).toBe(1);
    const list = await listBookmarks(db, a, { status: 'all' });
    // 首条生效（First），重复条被跳过
    expect(list.items.map((b) => b.name).sort()).toEqual(['First', 'Other']);
  });

  it('API 导入经路由 schema 后仍保留 isActive（防 zod 剥离回归）', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    const cookie = await setupAdmin(app);

    const res = await write(
      app,
      'POST',
      '/api/import',
      {
        password: 'pw123456',
        mode: 'merge',
        data: {
          bookmarks: [
            { url: 'https://active.com', name: 'Active' },
            { url: 'https://inactive.com', name: 'Inactive', isActive: false },
          ],
        },
      },
      cookie,
    );
    expect(res.status).toBe(200);

    const out = (await (
      await get(app, '/api/bookmarks?status=all&sort=name&dir=asc', cookie)
    ).json()) as { items: { name: string; isActive: boolean }[] };
    expect(out.items.map((b) => ({ name: b.name, isActive: b.isActive }))).toEqual([
      { name: 'Active', isActive: true },
      { name: 'Inactive', isActive: false },
    ]);
  });

  it('导入保留 isActive，旧文件缺字段时默认启用', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');

    await importData(db, a, {
      mode: 'merge',
      data: {
        bookmarks: [
          { url: 'https://active.com', name: 'Active' },
          { url: 'https://inactive.com', name: 'Inactive', isActive: false },
        ],
      },
    });

    const all = await listBookmarks(db, a, { status: 'all', sort: 'name', dir: 'asc' });
    expect(all.items.map((b) => ({ name: b.name, isActive: b.isActive }))).toEqual([
      { name: 'Active', isActive: true },
      { name: 'Inactive', isActive: false },
    ]);
  });

  it('replace：清空旧数据再建新', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    const old = await createTag(db, a, { name: 'old' });
    await createBookmark(db, a, { url: 'https://old.com', name: 'Old', tagIds: [old.id] });

    await importData(db, a, {
      mode: 'replace',
      data: {
        tags: [{ path: 'fresh' }],
        bookmarks: [{ url: 'https://fresh.com', name: 'Fresh', tagPaths: ['fresh'] }],
      },
    });

    expect((await listTags(db, a)).map((t) => t.path)).toEqual(['fresh']);
    const list = await listBookmarks(db, a, {});
    expect(list.items.map((b) => b.url)).toEqual(['https://fresh.com']);
  });

  it('隔离：导入只影响当前用户', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    const b = await newUser(db, 'b@x.com');
    await createBookmark(db, b, { url: 'https://b.com', name: 'B-bm' });

    await importData(db, a, {
      mode: 'replace',
      data: { bookmarks: [{ url: 'https://a.com', name: 'A-bm' }] },
    });

    expect((await listBookmarks(db, b, {})).items.map((x) => x.url)).toEqual(['https://b.com']);
  });

  it('导入应用背景相关偏好字段', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    await importData(db, a, {
      mode: 'merge',
      data: {
        prefs: {
          recentCount: 8,
          pageSize: 24,
          defaultSort: 'weight',
          backgroundType: 'bing',
          backgroundImageUrl: 'https://img.example/bg.jpg',
          backgroundOpacityLight: 60,
          backgroundOpacityDark: 40,
        },
      },
    });
    const prefs = await getPrefs(db, a);
    expect(prefs.backgroundType).toBe('bing');
    expect(prefs.backgroundImageUrl).toBe('https://img.example/bg.jpg');
    expect(prefs.backgroundOpacityLight).toBe(60);
    expect(prefs.backgroundOpacityDark).toBe(40);
  });

  it('导入应用音乐歌单', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    await importData(db, a, {
      mode: 'merge',
      data: {
        prefs: {
          recentCount: 8,
          pageSize: 24,
          defaultSort: 'weight',
          musicPlaylist: [
            { url: 'https://oss.example/a.mp3', name: 'A' },
            { url: 'https://oss.example/b.mp3', name: 'B' },
          ],
        },
      },
    });
    const prefs = await getPrefs(db, a);
    expect(JSON.parse(prefs.musicPlaylist)).toEqual([
      { url: 'https://oss.example/a.mp3', name: 'A' },
      { url: 'https://oss.example/b.mp3', name: 'B' },
    ]);
  });

  it('导入应用个人标语', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    await importData(db, a, {
      mode: 'merge',
      data: {
        prefs: {
          recentCount: 8,
          pageSize: 24,
          defaultSort: 'weight',
          slogan: '把时间留给热爱的事。',
        },
      },
    });
    const prefs = await getPrefs(db, a);
    expect(prefs.slogan).toBe('把时间留给热爱的事。');
  });

  it('API 导入保留音乐歌单与搜索引擎数据', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    const cookie = await setupAdmin(app);

    const res = await write(
      app,
      'POST',
      '/api/import',
      {
        password: 'pw123456',
        mode: 'replace',
        data: {
          engines: [
            {
              name: 'Kagi',
              urlTemplate: 'https://kagi.com/search?q={query}',
              iconUrl: 'https://kagi.com/favicon.ico',
              sortOrder: 0,
              isDefault: true,
            },
          ],
          prefs: {
            recentCount: 8,
            pageSize: 24,
            defaultSort: 'weight',
            musicPlaylist: [{ url: 'https://oss.example/kagi.mp3', name: 'Kagi theme' }],
            slogan: '把时间留给热爱的事。',
          },
        },
      },
      cookie,
    );
    expect(res.status).toBe(200);

    const prefs = (await (await get(app, '/api/prefs', cookie)).json()) as {
      prefs: { musicPlaylist: string; slogan: string };
    };
    expect(JSON.parse(prefs.prefs.musicPlaylist)).toEqual([
      { url: 'https://oss.example/kagi.mp3', name: 'Kagi theme' },
    ]);
    expect(prefs.prefs.slogan).toBe('把时间留给热爱的事。');

    const engines = (await (await get(app, '/api/engines', cookie)).json()) as {
      engines: { name: string; isDefault: boolean }[];
    };
    expect(engines.engines.map((e) => ({ name: e.name, isDefault: e.isDefault }))).toEqual([
      { name: 'Kagi', isDefault: true },
    ]);
  });

  it('兼容旧导出：缺背景字段时保留 schema 默认值', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    // 模拟新增字段前的导出文件：prefs 仅含原始三字段。
    await importData(db, a, {
      mode: 'merge',
      data: { prefs: { recentCount: 5, pageSize: 12, defaultSort: 'name' } },
    });
    const prefs = await getPrefs(db, a);
    expect(prefs.pageSize).toBe(12);
    expect(prefs.backgroundType).toBe('none');
    expect(prefs.backgroundImageUrl).toBe(null);
    expect(prefs.backgroundOpacityLight).toBe(70);
    expect(prefs.backgroundOpacityDark).toBe(70);
    expect(prefs.musicPlaylist).toBe('[]');
    expect(prefs.slogan).toBeNull();
  });

  it('导出→导入往返一致（replace 到新用户）', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    const tech = await createTag(db, a, { name: '技术' });
    const py = await createTag(db, a, { name: 'python', parentId: tech.id });
    await createBookmark(db, a, {
      url: 'https://dj.com',
      name: 'Django',
      description: 'web',
      tagIds: [py.id],
    });
    await createBookmark(db, a, { url: 'https://np.com', name: 'Numpy', tagIds: [py.id] });

    const dump = await exportData(db, a, new Date(0));

    const c = await newUser(db, 'c@x.com');
    await importData(db, c, { mode: 'replace', data: dump });
    const out = await exportData(db, c, new Date(0));

    const norm = (e: typeof dump) => ({
      tags: e.tags.map((t) => t.path).sort(),
      bookmarks: e.bookmarks
        .map((b) => ({
          url: b.url,
          name: b.name,
          isActive: b.isActive,
          tagPaths: [...b.tagPaths].sort(),
        }))
        .sort((x, y) => x.url.localeCompare(y.url)),
      engines: e.engines.map((g) => g.name),
      prefs: e.prefs,
    });
    expect(norm(out)).toEqual(norm(dump));
  });

  it('导入旧备份（无 suggestSource 字段）时按无处理', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    await importData(db, a, {
      mode: 'replace',
      data: {
        engines: [
          {
            name: 'SearXNG',
            urlTemplate: 'https://search.example.com/?q={query}',
            isDefault: true,
          },
        ],
      },
    });
    const list = await listEngines(db, a);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('SearXNG');
    expect(list[0]!.suggestSource).toBeNull();
  });

  it('导入带 suggestSource 的备份会原样保留', async () => {
    const db = createTestDb();
    const a = await newUser(db, 'a@x.com');
    await importData(db, a, {
      mode: 'replace',
      data: {
        engines: [
          {
            name: 'Google',
            urlTemplate: 'https://www.google.com/search?q={query}',
            isDefault: true,
            suggestSource: 'google',
          },
          {
            name: 'Baidu',
            urlTemplate: 'https://www.baidu.com/s?wd={query}',
            isDefault: false,
            suggestSource: 'baidu',
          },
        ],
      },
    });
    const list = await listEngines(db, a);
    expect(list.map((e) => ({ name: e.name, suggestSource: e.suggestSource }))).toEqual([
      { name: 'Google', suggestSource: 'google' },
      { name: 'Baidu', suggestSource: 'baidu' },
    ]);
  });
});

describe('导入导出的密码二次确认（后端强制校验）', () => {
  it('导出：密码正确返回全量数据', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    const cookie = await setupAdmin(app);

    const res = await write(app, 'POST', '/api/export', { password: 'pw123456' }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; bookmarks: unknown[] };
    expect(body.version).toBe(1);
    expect(Array.isArray(body.bookmarks)).toBe(true);
  });

  it('导出：密码错误返回 400 wrong_password', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    const cookie = await setupAdmin(app);

    const res = await write(app, 'POST', '/api/export', { password: 'wrongpw' }, cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('wrong_password');
  });

  it('导出：缺少密码返回 400 invalid', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    const cookie = await setupAdmin(app);

    const res = await write(app, 'POST', '/api/export', {}, cookie);
    expect(res.status).toBe(400);
  });

  it('导出：未登录返回 401', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    await setupAdmin(app);

    const res = await write(app, 'POST', '/api/export', { password: 'pw123456' });
    expect(res.status).toBe(401);
  });

  it('导入：密码错误则不写入并返回 400 wrong_password', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    const cookie = await setupAdmin(app);

    const res = await write(
      app,
      'POST',
      '/api/import',
      {
        password: 'wrongpw',
        mode: 'merge',
        data: { bookmarks: [{ url: 'https://nope.com', name: 'Nope' }] },
      },
      cookie,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('wrong_password');

    // 密码错误时不应产生任何写入。
    const out = (await (await get(app, '/api/bookmarks?status=all', cookie)).json()) as {
      items: unknown[];
    };
    expect(out.items).toHaveLength(0);
  });

  it('导入：缺少密码返回 400', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });
    const cookie = await setupAdmin(app);

    const res = await write(
      app,
      'POST',
      '/api/import',
      { mode: 'merge', data: { bookmarks: [{ url: 'https://x.com', name: 'X' }] } },
      cookie,
    );
    expect(res.status).toBe(400);
  });
});
