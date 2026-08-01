import { describe, it, expect } from 'vitest';
import { createApp } from '@/app';
import { createTestDb } from '../helpers/testDb';

const ORIGIN = 'http://localhost';

function cookieFrom(res: Response): string {
  const m = (res.headers.get('set-cookie') ?? '').match(/navi_session=([^;]+)/);
  return m ? `navi_session=${m[1]}` : '';
}

function post(app: ReturnType<typeof createApp>, path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('端到端：首启 → 建号 → 登录 → 鉴权', () => {
  it('完整链路', async () => {
    const db = createTestDb();
    const app = createApp(db, { secureCookie: false });

    // health
    expect((await app.request('/api/health')).status).toBe(200);

    // 首启
    expect(
      ((await (await app.request('/api/setup/status')).json()) as { needsSetup: boolean })
        .needsSetup,
    ).toBe(true);
    let res = await post(app, '/api/setup', {
      email: 'admin@x.com',
      password: 'pw123456',
      displayName: 'Admin',
    });
    expect(res.status).toBe(201);
    const adminCookie = cookieFrom(res);
    expect(adminCookie).toContain('navi_session=');

    // 管理员建普通用户
    res = await post(
      app,
      '/api/admin/users',
      { email: 'bob@x.com', password: 'pw123456', displayName: 'Bob' },
      adminCookie,
    );
    expect(res.status).toBe(201);

    // 普通用户登录
    res = await post(app, '/api/auth/login', { email: 'bob@x.com', password: 'pw123456' });
    expect(res.status).toBe(200);
    const bobCookie = cookieFrom(res);

    // 普通用户能看自己
    res = await app.request('/api/auth/me', { headers: { Cookie: bobCookie } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe('bob@x.com');

    // 普通用户访问 admin 被拒
    expect((await app.request('/api/admin/users', { headers: { Cookie: bobCookie } })).status).toBe(
      403,
    );
  });
});
