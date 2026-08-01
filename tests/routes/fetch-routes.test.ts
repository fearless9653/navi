import { describe, it, expect } from 'vitest';
import { createApp } from '@/app';
import { createTestDb } from '../helpers/testDb';
import type { Metadata } from '@/services/metadata';

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

// 假抓取：按 url 返回固定元数据，记录调用。
function fakeFetchMeta(calls: string[]) {
  return async (url: string): Promise<Metadata> => {
    calls.push(url);
    if (url.includes('fail')) throw new Error('boom');
    return {
      title: 'Fetched Title',
      description: 'fetched desc',
      faviconUrl: 'https://x.com/f.png',
    };
  };
}

async function setupAdmin(app: App): Promise<string> {
  const res = await write(app, 'POST', '/api/setup', {
    email: 'admin@x.com',
    password: 'pw123456',
    displayName: 'Admin',
  });
  return cookieFrom(res);
}

describe('抓取路由', () => {
  it('未登录 → 401', async () => {
    const app = createApp(createTestDb(), { secureCookie: false, fetchMeta: fakeFetchMeta([]) });
    expect((await write(app, 'POST', '/api/fetch/metadata', { url: 'https://x.com' })).status).toBe(
      401,
    );
  });

  it('预填：返回元数据不落库', async () => {
    const calls: string[] = [];
    const app = createApp(createTestDb(), { secureCookie: false, fetchMeta: fakeFetchMeta(calls) });
    const cookie = await setupAdmin(app);
    const res = await write(app, 'POST', '/api/fetch/metadata', { url: 'https://x.com' }, cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { metadata: Metadata }).metadata.title).toBe('Fetched Title');
    expect(calls).toEqual(['https://x.com']);
  });

  it('单条抓取更新书签字段', async () => {
    const app = createApp(createTestDb(), { secureCookie: false, fetchMeta: fakeFetchMeta([]) });
    const cookie = await setupAdmin(app);
    let res = await write(
      app,
      'POST',
      '/api/bookmarks',
      { url: 'https://x.com', name: 'X' },
      cookie,
    );
    const id = ((await res.json()) as { bookmark: { id: number } }).bookmark.id;
    res = await write(app, 'POST', `/api/bookmarks/${id}/fetch`, undefined, cookie);
    expect(res.status).toBe(200);
    const bm = ((await res.json()) as { bookmark: { description: string; faviconUrl: string } })
      .bookmark;
    expect(bm.description).toBe('fetched desc');
    expect(bm.faviconUrl).toBe('https://x.com/f.png');
  });

  it('隔离：不能抓取他人书签', async () => {
    const app = createApp(createTestDb(), { secureCookie: false, fetchMeta: fakeFetchMeta([]) });
    const adminCookie = await setupAdmin(app);
    let res = await write(
      app,
      'POST',
      '/api/bookmarks',
      { url: 'https://a.com', name: 'A' },
      adminCookie,
    );
    const aId = ((await res.json()) as { bookmark: { id: number } }).bookmark.id;

    await write(
      app,
      'POST',
      '/api/admin/users',
      { email: 'b@x.com', password: 'pw123456', displayName: 'B' },
      adminCookie,
    );
    res = await write(app, 'POST', '/api/auth/login', { email: 'b@x.com', password: 'pw123456' });
    const bCookie = cookieFrom(res);

    // Bob 抓取 admin 的书签 → 404
    expect(
      (await write(app, 'POST', `/api/bookmarks/${aId}/fetch`, undefined, bCookie)).status,
    ).toBe(404);
  });

  it('抓取失败不回显内部错误串（避免内网探测 oracle）', async () => {
    const app = createApp(createTestDb(), { secureCookie: false, fetchMeta: fakeFetchMeta([]) });
    const cookie = await setupAdmin(app);
    const res = await write(
      app,
      'POST',
      '/api/fetch/metadata',
      { url: 'https://fail.com' },
      cookie,
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('fetch_failed');
    expect(body.message).toBeUndefined();
  });
});

describe('请求体与字段上限', () => {
  it('超长字段被拒（400）', async () => {
    const app = createApp(createTestDb(), { secureCookie: false, fetchMeta: fakeFetchMeta([]) });
    const cookie = await setupAdmin(app);
    const res = await write(
      app,
      'POST',
      '/api/bookmarks',
      { url: 'https://x.com', name: 'n'.repeat(201) },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it('超大请求体被拒（413）', async () => {
    const app = createApp(createTestDb(), { secureCookie: false, fetchMeta: fakeFetchMeta([]) });
    const cookie = await setupAdmin(app);
    const huge = 'x'.repeat(8 * 1024 * 1024 + 1000); // > 8MB 上限
    const res = await write(
      app,
      'POST',
      '/api/bookmarks',
      { url: 'https://x.com', name: 'X', description: huge },
      cookie,
    );
    expect(res.status).toBe(413);
  });
});
