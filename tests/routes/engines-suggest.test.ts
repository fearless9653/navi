import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@/app';
import { createTestDb } from '../helpers/testDb';
import { createUser, getUserByEmail } from '@/services/users';
import { listEngines, updateEngine } from '@/services/engines';
import { SUGGEST_LOG_COMPONENT } from '@/services/suggest';

type App = ReturnType<typeof createApp>;
const ORIGIN = 'http://localhost';

function cookieFrom(res: Response): string {
  const m = (res.headers.get('set-cookie') ?? '').match(/navi_session=([^;]+)/);
  return m ? `navi_session=${m[1]}` : '';
}

function get(app: App, path: string, cookie?: string, extraHeaders?: Record<string, string>) {
  return app.request(path, {
    headers: {
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
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

describe('GET /api/engines/:id/suggest logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockConsole() {
    return {
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  }

  function payloadsOf(spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
    return spy.mock.calls.map((args) => args[0] as Record<string, unknown>);
  }

  function serializeCalls(spy: { mock: { calls: unknown[][] } }): string {
    return spy.mock.calls
      .map((args) =>
        args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
      )
      .join('\n');
  }

  it('来源为无或空查询时不打日志、不打上游', async () => {
    const { info, warn } = mockConsole();
    const fetchImpl = vi.fn();
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);
    const { engines } = (await (await get(app, '/api/engines', cookie)).json()) as {
      engines: { id: number }[];
    };
    const q = '天地secret-query';
    const noneRes = await get(
      app,
      `/api/engines/${engines[0]!.id}/suggest?q=${encodeURIComponent(q)}`,
      cookie,
      { 'cf-ray': 'a58b98806f7b795b-NRT' },
    );
    expect(noneRes.status).toBe(200);
    expect(await noneRes.json()).toEqual({ q, suggestions: [] });

    const emptyRes = await get(app, `/api/engines/${engines[0]!.id}/suggest?q=%20`, cookie, {
      'cf-ray': 'ray-empty-route',
    });
    expect(emptyRes.status).toBe(200);
    expect(await emptyRes.json()).toEqual({ q: '', suggestions: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('成功路径不打日志；失败时透传 requestId 且不含查询词', async () => {
    const { info, warn } = mockConsole();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(['天地secret-query', ['one']]))
      .mockRejectedValueOnce(
        new TypeError(
          'Failed to fetch: https://suggestqueries.google.com/complete/search?q=天地secret-query',
        ),
      );
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false, suggestFetch: fetchImpl });
    const cookie = await setupAdmin(app);
    const admin = (await getUserByEmail(db, 'admin@x.com'))!;
    const engine = (await listEngines(db, admin.id))[0]!;
    await updateEngine(db, admin.id, engine.id, { suggestSource: 'google' });

    const q = '天地secret-query';
    const ok = await get(
      app,
      `/api/engines/${engine.id}/suggest?q=${encodeURIComponent(q)}`,
      cookie,
      { 'cf-ray': 'ray-success-route' },
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ q, suggestions: ['one'] });
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    const failQ = `${q}-retry`;
    const fail = await get(
      app,
      `/api/engines/${engine.id}/suggest?q=${encodeURIComponent(failQ)}`,
      cookie,
      { 'cf-ray': 'ray-error-route' },
    );
    expect(fail.status).toBe(200);
    expect(await fail.json()).toEqual({ q: failQ, suggestions: [] });
    expect(payloadsOf(warn)[0]).toMatchObject({
      component: SUGGEST_LOG_COMPONENT,
      event: 'upstream_error',
      source: 'google',
      requestId: 'ray-error-route',
      reason: 'network',
    });
    const text = serializeCalls(info) + serializeCalls(warn);
    expect(text).not.toContain(q);
    expect(text).not.toContain('secret-query');
    expect(text).not.toContain('suggestqueries.google.com');
  });
});
