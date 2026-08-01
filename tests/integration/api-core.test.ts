import { describe, it, expect } from 'vitest';
import { createApp } from '@/app';
import { createTestDb } from '../helpers/testDb';

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

describe('核心数据 API（端到端 + 隔离）', () => {
  it('未登录访问核心路由 → 401', async () => {
    const app = createApp(createTestDb(), { secureCookie: false });
    for (const p of ['/api/tags', '/api/bookmarks', '/api/engines', '/api/prefs']) {
      expect((await get(app, p)).status).toBe(401);
    }
  });

  it('标签/网址/最近/引擎/偏好 全链路', async () => {
    const app = createApp(createTestDb(), { secureCookie: false });
    const cookie = await setupAdmin(app);

    // 建标签：技术 > python
    let res = await write(app, 'POST', '/api/tags', { name: '技术' }, cookie);
    expect(res.status).toBe(201);
    const tech = ((await res.json()) as { tag: { id: number } }).tag;
    res = await write(app, 'POST', '/api/tags', { name: 'python', parentId: tech.id }, cookie);
    const py = ((await res.json()) as { tag: { id: number } }).tag;

    res = await get(app, '/api/tags', cookie);
    expect(((await res.json()) as { tags: unknown[] }).tags.length).toBe(2);

    // 建网址，挂在子标签 python 上
    res = await write(
      app,
      'POST',
      '/api/bookmarks',
      { url: 'https://dj.com', name: 'Django', tagIds: [py.id] },
      cookie,
    );
    expect(res.status).toBe(201);
    const bm = ((await res.json()) as { bookmark: { id: number } }).bookmark;

    // 按父标签筛选应命中（父含子）
    res = await get(app, `/api/bookmarks?tags=${tech.id}`, cookie);
    let list = (await res.json()) as { total: number; items: { id: number }[] };
    expect(list.total).toBe(1);
    expect(list.items[0]!.id).toBe(bm.id);

    // 模糊搜索（中文 2 字也可，这里用英文子串）
    res = await get(app, '/api/bookmarks?q=jang', cookie);
    expect(((await res.json()) as { total: number }).total).toBe(1);

    // 访问登记 + 最近
    expect(
      (await write(app, 'POST', `/api/bookmarks/${bm.id}/visit`, undefined, cookie)).status,
    ).toBe(200);
    res = await get(app, '/api/bookmarks/recent', cookie);
    expect(((await res.json()) as { items: unknown[] }).items.length).toBe(1);

    // 清空最近
    await write(app, 'DELETE', '/api/bookmarks/recent', undefined, cookie);
    res = await get(app, '/api/bookmarks/recent', cookie);
    expect(((await res.json()) as { items: unknown[] }).items.length).toBe(0);

    // 引擎：默认切换
    res = await get(app, '/api/engines', cookie);
    const engines = (
      (await res.json()) as { engines: { id: number; name: string; isDefault: boolean }[] }
    ).engines;
    expect(engines.length).toBe(3);
    const bing = engines.find((e) => e.name === 'Bing')!;
    await write(app, 'POST', `/api/engines/${bing.id}/default`, undefined, cookie);
    res = await get(app, '/api/engines', cookie);
    const after = ((await res.json()) as { engines: { name: string; isDefault: boolean }[] })
      .engines;
    expect(after.filter((e) => e.isDefault).map((e) => e.name)).toEqual(['Bing']);

    // 偏好
    res = await get(app, '/api/prefs', cookie);
    expect(((await res.json()) as { prefs: { pageSize: number } }).prefs.pageSize).toBe(24);
    res = await write(
      app,
      'PATCH',
      '/api/prefs',
      { pageSize: 50, slogan: '把时间留给热爱的事。' },
      cookie,
    );
    expect(
      ((await res.json()) as { prefs: { pageSize: number; slogan: string } }).prefs,
    ).toMatchObject({ pageSize: 50, slogan: '把时间留给热爱的事。' });

    // 批量删除
    await write(app, 'POST', '/api/bookmarks', { url: 'https://x.com', name: 'X' }, cookie);
    res = await get(app, '/api/bookmarks', cookie);
    list = (await res.json()) as { total: number; items: { id: number }[] };
    expect(list.total).toBe(2);
    res = await write(
      app,
      'POST',
      '/api/bookmarks/bulk-delete',
      { ids: list.items.map((b) => b.id) },
      cookie,
    );
    expect(((await res.json()) as { deleted: number }).deleted).toBe(2);
    expect(
      ((await (await get(app, '/api/bookmarks', cookie)).json()) as { total: number }).total,
    ).toBe(0);
  });

  it('非法查询参数不落入 SQL：page/pageSize/limit 回退默认，parent_id 拒绝', async () => {
    const app = createApp(createTestDb(), { secureCookie: false });
    const cookie = await setupAdmin(app);

    // NaN 分页参数按缺省处理，不把 NaN 传进 limit/offset
    expect((await get(app, '/api/bookmarks?page=abc&pageSize=xyz', cookie)).status).toBe(200);
    // NaN limit 回退偏好值
    expect((await get(app, '/api/bookmarks/recent?limit=abc', cookie)).status).toBe(200);
    // 非整数 parent_id 明确拒绝
    expect((await get(app, '/api/tags?parent_id=abc', cookie)).status).toBe(400);
  });

  it('隔离：用户 A 不能读/改用户 B 的资源', async () => {
    const app = createApp(createTestDb(), { secureCookie: false });
    const adminCookie = await setupAdmin(app);

    // admin 建一个网址
    let res = await write(
      app,
      'POST',
      '/api/bookmarks',
      { url: 'https://secret.com', name: 'Secret' },
      adminCookie,
    );
    const secret = ((await res.json()) as { bookmark: { id: number } }).bookmark;

    // admin 建普通用户 Bob
    res = await write(
      app,
      'POST',
      '/api/admin/users',
      { email: 'bob@x.com', password: 'pw123456', displayName: 'Bob' },
      adminCookie,
    );
    expect(res.status).toBe(201);

    // Bob 登录
    res = await write(app, 'POST', '/api/auth/login', { email: 'bob@x.com', password: 'pw123456' });
    const bobCookie = cookieFrom(res);

    // Bob 列表为空
    expect(
      ((await (await get(app, '/api/bookmarks', bobCookie)).json()) as { total: number }).total,
    ).toBe(0);
    // Bob 读 admin 的网址 → 404
    expect((await get(app, `/api/bookmarks/${secret.id}`, bobCookie)).status).toBe(404);
    // Bob 改 admin 的网址 → 404
    expect(
      (await write(app, 'PATCH', `/api/bookmarks/${secret.id}`, { name: 'hacked' }, bobCookie))
        .status,
    ).toBe(404);
    // admin 的网址未被篡改
    res = await get(app, `/api/bookmarks/${secret.id}`, adminCookie);
    expect(((await res.json()) as { bookmark: { name: string } }).bookmark.name).toBe('Secret');
  });

  it('PATCH/DELETE 不存在或跨用户的标签/引擎/网址 → 404（统一语义）', async () => {
    const app = createApp(createTestDb(), { secureCookie: false });
    const adminCookie = await setupAdmin(app);

    // admin 建标签 + 网址；引擎为建号时预置
    let res = await write(app, 'POST', '/api/tags', { name: '技术' }, adminCookie);
    const tag = ((await res.json()) as { tag: { id: number } }).tag;
    res = await write(
      app,
      'POST',
      '/api/bookmarks',
      { url: 'https://x.com', name: 'X' },
      adminCookie,
    );
    const bm = ((await res.json()) as { bookmark: { id: number } }).bookmark;
    const engine = (
      (await (await get(app, '/api/engines', adminCookie)).json()) as { engines: { id: number }[] }
    ).engines[0]!;

    // 建普通用户 Bob 并登录
    await write(
      app,
      'POST',
      '/api/admin/users',
      { email: 'bob@x.com', password: 'pw123456', displayName: 'Bob' },
      adminCookie,
    );
    const bobCookie = cookieFrom(
      await write(app, 'POST', '/api/auth/login', { email: 'bob@x.com', password: 'pw123456' }),
    );

    // Bob 改/删 admin 的资源 → 404
    expect(
      (await write(app, 'PATCH', `/api/tags/${tag.id}`, { name: 'hacked' }, bobCookie)).status,
    ).toBe(404);
    expect((await write(app, 'DELETE', `/api/tags/${tag.id}`, undefined, bobCookie)).status).toBe(
      404,
    );
    expect(
      (await write(app, 'PATCH', `/api/engines/${engine.id}`, { name: 'hacked' }, bobCookie))
        .status,
    ).toBe(404);
    expect(
      (await write(app, 'DELETE', `/api/engines/${engine.id}`, undefined, bobCookie)).status,
    ).toBe(404);
    expect(
      (await write(app, 'DELETE', `/api/bookmarks/${bm.id}`, undefined, bobCookie)).status,
    ).toBe(404);

    // 不存在的 id → 404
    expect((await write(app, 'PATCH', '/api/tags/999999', { name: 'x' }, adminCookie)).status).toBe(
      404,
    );
    expect((await write(app, 'DELETE', '/api/engines/999999', undefined, adminCookie)).status).toBe(
      404,
    );
    expect(
      (await write(app, 'DELETE', '/api/bookmarks/999999', undefined, adminCookie)).status,
    ).toBe(404);

    // admin 的资源未被篡改（标签仍在）
    res = await get(app, '/api/tags', adminCookie);
    expect(
      ((await res.json()) as { tags: { id: number; name: string }[] }).tags.some(
        (t) => t.id === tag.id && t.name === '技术',
      ),
    ).toBe(true);
  });

  it('defaultSort 支持 updated 并可持久化', async () => {
    const app = createApp(createTestDb(), { secureCookie: false });
    const cookie = await setupAdmin(app);
    const res = await write(app, 'PATCH', '/api/prefs', { defaultSort: 'updated' }, cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { prefs: { defaultSort: string } }).prefs.defaultSort).toBe(
      'updated',
    );
  });
});
