import { describe, expect, it, vi } from 'vitest';
import { createApp } from '@/app';
import { createTestDb } from '../helpers/testDb';
import { createUser, getUserByEmail } from '@/services/users';
import { listEngines, updateEngine } from '@/services/engines';

type App = ReturnType<typeof createApp>;
const ORIGIN = 'http://localhost';

function cookieFrom(res: Response): string {
  const m = (res.headers.get('set-cookie') ?? '').match(/navi_session=([^;]+)/);
  return m ? `navi_session=${m[1]}` : '';
}

function get(app: App, path: string, cookie?: string) {
  return app.request(path, {
    headers: cookie ? { Cookie: cookie, Origin: ORIGIN } : { Origin: ORIGIN },
  });
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

async function setupAdmin(app: App): Promise<string> {
  const res = await write(app, 'POST', '/api/setup', {
    email: 'admin@x.com',
    password: 'pw123456',
    displayName: 'Admin',
  });
  return cookieFrom(res);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('GET /api/engines/:id/suggest', () => {
  it('未登录 → 401', async () => {
    const fetchImpl = vi.fn();
    const app = createApp(createTestDb(), { secureCookie: false, suggestFetch: fetchImpl });
    expect((await get(app, '/api/engines/1/suggest?q=foo')).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('引擎不存在或属于他人 → 404，且不打上游', async () => {
    const fetchImpl = vi.fn();
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);

    expect((await get(app, '/api/engines/999999/suggest?q=foo', cookie)).status).toBe(404);

    const other = await createUser(db, {
      email: 'b@x.com',
      password: 'pw123456',
      displayName: 'B',
    });
    const otherEngine = (await listEngines(db, other.id))[0]!;
    await updateEngine(db, other.id, otherEngine.id, { suggestSource: 'google' });
    expect((await get(app, `/api/engines/${otherEngine.id}/suggest?q=foo`, cookie)).status).toBe(
      404,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('来源为无时返回空列表且不调用 fetch', async () => {
    const fetchImpl = vi.fn();
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);
    const { engines } = (await (await get(app, '/api/engines', cookie)).json()) as {
      engines: { id: number; suggestSource: string | null }[];
    };
    const seeded = engines[0]!;
    expect(seeded.suggestSource).toBeNull();

    const res = await get(app, `/api/engines/${seeded.id}/suggest?q=weather`, cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'weather', suggestions: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('空查询不打上游', async () => {
    const fetchImpl = vi.fn();
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);
    const { engines } = (await (await get(app, '/api/engines', cookie)).json()) as {
      engines: { id: number }[];
    };
    const res = await get(app, `/api/engines/${engines[0]!.id}/suggest?q=%20`, cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: '', suggestions: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('google / baidu 来源走对应上游并回显规范化 { q, suggestions }', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes('suggestqueries.google.com')) {
        expect(url).toContain('client=firefox');
        expect(url).not.toContain('output=firefox');
        return jsonResponse(['weather', ['weather today', 'weather tomorrow']]);
      }
      expect(url).toContain('www.baidu.com/sugrec');
      expect(url).toContain('prod=pc');
      return jsonResponse({ g: [{ q: '天气预报' }, { q: '天气查询' }] });
    });
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);
    const admin = (await getUserByEmail(db, 'admin@x.com'))!;
    const listed = await listEngines(db, admin.id);
    const googleEngine = listed.find((e) => e.name === 'Google')!;
    const bingEngine = listed.find((e) => e.name === 'Bing')!;

    await updateEngine(db, admin.id, googleEngine.id, { suggestSource: 'google' });
    await updateEngine(db, admin.id, bingEngine.id, { suggestSource: 'baidu' });

    const googleRes = await get(app, `/api/engines/${googleEngine.id}/suggest?q=weather`, cookie);
    expect(googleRes.status).toBe(200);
    expect(await googleRes.json()).toEqual({
      q: 'weather',
      suggestions: ['weather today', 'weather tomorrow'],
    });

    const baiduRes = await get(app, `/api/engines/${bingEngine.id}/suggest?q=天气`, cookie);
    expect(baiduRes.status).toBe(200);
    expect(await baiduRes.json()).toEqual({
      q: '天气',
      suggestions: ['天气预报', '天气查询'],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('上游失败仍返回 200 空列表', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);
    const admin = (await getUserByEmail(db, 'admin@x.com'))!;
    const engine = (await listEngines(db, admin.id))[0]!;
    await updateEngine(db, admin.id, engine.id, { suggestSource: 'google' });

    const res = await get(app, `/api/engines/${engine.id}/suggest?q=fail`, cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'fail', suggestions: [] });
  });

  it('不接受客户端传入的 source 参数', async () => {
    const fetchImpl = vi.fn();
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);
    const { engines } = (await (await get(app, '/api/engines', cookie)).json()) as {
      engines: { id: number }[];
    };
    const res = await get(
      app,
      `/api/engines/${engines[0]!.id}/suggest?q=weather&source=google`,
      cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'weather', suggestions: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
