import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createTestDb } from '../helpers/testDb';
import type { DB } from '@/db/client';
import { sessionAuth, type AppEnv } from '@/middleware/auth';
import { createLoginRateLimiter } from '@/middleware/rateLimit';
import { setupRoutes } from '@/routes/setup';
import { authRoutes } from '@/routes/auth';

function buildApp(db: DB, max = 5): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const loginLimiter = createLoginRateLimiter({ max, windowMs: 60_000 });
  app.use('*', sessionAuth(db));
  app.route('/api/setup', setupRoutes(db, { secureCookie: false }));
  app.route('/api/auth', authRoutes(db, { secureCookie: false, loginLimiter }));
  return app;
}

function cookieFrom(res: Response): string {
  const sc = res.headers.get('set-cookie') ?? '';
  const m = sc.match(/navi_session=([^;]+)/);
  return m ? `navi_session=${m[1]}` : '';
}

function jsonReq(app: Hono<AppEnv>, path: string, method: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ADMIN = { email: 'admin@x.com', password: 'pw123456', displayName: 'Admin' };

describe('setup + auth routes', () => {
  it('首启：status / 创建管理员 / 二次 409', async () => {
    const db = createTestDb();
    const app = buildApp(db);

    let res = await app.request('/api/setup/status');
    expect(await res.json()).toEqual({ needsSetup: true });

    res = await jsonReq(app, '/api/setup', 'POST', ADMIN);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { user: { isAdmin: boolean; passwordHash?: unknown } };
    expect(created.user.isAdmin).toBe(true);
    expect(created.user.passwordHash).toBeUndefined();

    res = await app.request('/api/setup/status');
    expect(await res.json()).toEqual({ needsSetup: false });

    res = await jsonReq(app, '/api/setup', 'POST', {
      email: 'x@y.com',
      password: 'pw123456',
      displayName: 'X',
    });
    expect(res.status).toBe(409);
  });

  it('登录 → me → 改密 → 用新密码登录', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    await jsonReq(app, '/api/setup', 'POST', ADMIN);

    expect((await app.request('/api/auth/me')).status).toBe(401);

    let res = await jsonReq(app, '/api/auth/login', 'POST', {
      email: ADMIN.email,
      password: ADMIN.password,
    });
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    expect(cookie).toContain('navi_session=');

    res = await app.request('/api/auth/me', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe(ADMIN.email);

    res = await jsonReq(
      app,
      '/api/auth/change-password',
      'POST',
      { currentPassword: ADMIN.password, newPassword: 'newpw12345' },
      cookie,
    );
    expect(res.status).toBe(200);

    res = await jsonReq(app, '/api/auth/login', 'POST', {
      email: ADMIN.email,
      password: ADMIN.password,
    });
    expect(res.status).toBe(401); // 旧密码失效

    res = await jsonReq(app, '/api/auth/login', 'POST', {
      email: ADMIN.email,
      password: 'newpw12345',
    });
    expect(res.status).toBe(200); // 新密码可用
  });

  it('改密后吊销全部旧会话，仅当前设备用重签的新会话续命', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    await jsonReq(app, '/api/setup', 'POST', ADMIN);

    // 两个设备各自登录，拿到两个会话 cookie。
    const login = () =>
      jsonReq(app, '/api/auth/login', 'POST', { email: ADMIN.email, password: ADMIN.password });
    const c1 = cookieFrom(await login());
    const c2 = cookieFrom(await login());
    expect((await app.request('/api/auth/me', { headers: { Cookie: c1 } })).status).toBe(200);
    expect((await app.request('/api/auth/me', { headers: { Cookie: c2 } })).status).toBe(200);

    // 设备1 改密：响应重签当前设备的新会话。
    const res = await jsonReq(
      app,
      '/api/auth/change-password',
      'POST',
      { currentPassword: ADMIN.password, newPassword: 'newpw12345' },
      c1,
    );
    expect(res.status).toBe(200);
    const c1new = cookieFrom(res);
    expect(c1new).toContain('navi_session=');

    // 两个旧会话（含当前设备旧 token）全部失效；仅当前设备的新会话有效。
    expect((await app.request('/api/auth/me', { headers: { Cookie: c1 } })).status).toBe(401);
    expect((await app.request('/api/auth/me', { headers: { Cookie: c2 } })).status).toBe(401);
    expect((await app.request('/api/auth/me', { headers: { Cookie: c1new } })).status).toBe(200);
  });

  it('登录限流：超过阈值返回 429', async () => {
    const db = createTestDb();
    const app = buildApp(db, 3);
    await jsonReq(app, '/api/setup', 'POST', ADMIN);

    for (let i = 0; i < 3; i++) {
      const r = await jsonReq(app, '/api/auth/login', 'POST', {
        email: ADMIN.email,
        password: 'wrong',
      });
      expect(r.status).toBe(401);
    }
    const blocked = await jsonReq(app, '/api/auth/login', 'POST', {
      email: ADMIN.email,
      password: 'wrong',
    });
    expect(blocked.status).toBe(429);
  });

  it('登录限流按注入的 clientIp 分桶：不同来源独立计数，且不再读 X-Forwarded-For', async () => {
    const db = createTestDb();
    const app = new Hono<AppEnv>();
    const loginLimiter = createLoginRateLimiter({ max: 2, windowMs: 60_000 });
    app.use('*', sessionAuth(db));
    app.route('/api/setup', setupRoutes(db, { secureCookie: false }));
    app.route(
      '/api/auth',
      authRoutes(db, {
        secureCookie: false,
        loginLimiter,
        // 测试用注入：真实入口用 socket / CF-Connecting-IP，均不可被客户端伪造。
        clientIp: (c) => c.req.header('x-test-ip') ?? 'local',
      }),
    );
    await jsonReq(app, '/api/setup', 'POST', ADMIN);

    const login = (ip: string, xff?: string) =>
      app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-ip': ip,
          ...(xff ? { 'x-forwarded-for': xff } : {}),
        },
        body: JSON.stringify({ email: ADMIN.email, password: 'wrong' }),
      });

    // 来源 1.1.1.1 连撞 2 次达上限 → 第 3 次被限；即便每次伪造不同 XFF 也不再另开桶。
    expect((await login('1.1.1.1', 'a')).status).toBe(401);
    expect((await login('1.1.1.1', 'b')).status).toBe(401);
    expect((await login('1.1.1.1', 'c')).status).toBe(429);
    // 另一来源 2.2.2.2 不受影响。
    expect((await login('2.2.2.2')).status).toBe(401);
  });
});
