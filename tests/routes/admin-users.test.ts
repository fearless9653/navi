import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createTestDb } from '../helpers/testDb';
import type { DB } from '@/db/client';
import { sessionAuth, requireAuth, type AppEnv } from '@/middleware/auth';
import { adminUserRoutes } from '@/routes/adminUsers';
import { createUser } from '@/services/users';
import { createSession } from '@/services/sessions';

function buildApp(db: DB): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', sessionAuth(db));
  app.get('/api/whoami', requireAuth, (c) => c.json({ id: c.get('user')!.id }));
  app.route('/api/admin/users', adminUserRoutes(db));
  return app;
}

async function cookieFor(
  db: DB,
  opts: { isAdmin?: boolean; email?: string } = {},
): Promise<string> {
  const u = await createUser(db, {
    email: opts.email ?? 'admin@x.com',
    password: 'pw123456',
    displayName: 'U',
    isAdmin: opts.isAdmin ?? false,
  });
  const token = await createSession(db, u.id);
  return `navi_session=${token}`;
}

function req(app: Hono<AppEnv>, path: string, method: string, body?: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('admin user routes', () => {
  it('未登录 401，普通用户 403', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    expect((await app.request('/api/admin/users')).status).toBe(401);
    const userCookie = await cookieFor(db, { isAdmin: false, email: 'u@x.com' });
    expect(
      (await app.request('/api/admin/users', { headers: { Cookie: userCookie } })).status,
    ).toBe(403);
  });

  it('管理员可列出/创建/改/删账号', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    const admin = await cookieFor(db, { isAdmin: true });

    let res = await req(
      app,
      '/api/admin/users',
      'POST',
      { email: 'new@x.com', password: 'pw123456', displayName: 'New' },
      admin,
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as { user: { id: number } };
    const newId = created.user.id;

    res = await app.request('/api/admin/users', { headers: { Cookie: admin } });
    const list = (await res.json()) as { users: unknown[] };
    expect(list.users.length).toBe(2);

    res = await req(app, `/api/admin/users/${newId}`, 'PATCH', { displayName: 'Renamed' }, admin);
    expect(res.status).toBe(200);

    res = await req(app, `/api/admin/users/${newId}`, 'DELETE', undefined, admin);
    expect(res.status).toBe(200);

    res = await req(app, '/api/admin/users/9999', 'DELETE', undefined, admin);
    expect(res.status).toBe(404);
  });

  it('创建重复邮箱 409', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    const admin = await cookieFor(db, { isAdmin: true, email: 'admin@x.com' });
    const res = await req(
      app,
      '/api/admin/users',
      'POST',
      { email: 'admin@x.com', password: 'pw123456', displayName: 'Dup' },
      admin,
    );
    expect(res.status).toBe(409);
  });

  it('不可删除/降级最后一个管理员', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    const admin = await cookieFor(db, { isAdmin: true });
    // 找到该 admin 的 id
    const listRes = await app.request('/api/admin/users', { headers: { Cookie: admin } });
    const { users } = (await listRes.json()) as { users: { id: number; isAdmin: boolean }[] };
    const adminId = users.find((u) => u.isAdmin)!.id;

    expect((await req(app, `/api/admin/users/${adminId}`, 'DELETE', undefined, admin)).status).toBe(
      409,
    );
    expect(
      (await req(app, `/api/admin/users/${adminId}`, 'PATCH', { isAdmin: false }, admin)).status,
    ).toBe(409);
  });

  it('停用账号后其会话立即失效', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    const admin = await cookieFor(db, { isAdmin: true, email: 'admin@x.com' });
    const victim = await createUser(db, {
      email: 'v@x.com',
      password: 'pw123456',
      displayName: 'V',
    });
    const victimToken = await createSession(db, victim.id);
    const victimCookie = `navi_session=${victimToken}`;

    expect((await app.request('/api/whoami', { headers: { Cookie: victimCookie } })).status).toBe(
      200,
    );
    await req(app, `/api/admin/users/${victim.id}`, 'PATCH', { isActive: false }, admin);
    expect((await app.request('/api/whoami', { headers: { Cookie: victimCookie } })).status).toBe(
      401,
    );
  });

  it('两个管理员：删到最后一个时被守卫拦下（计数在删除时重算）', async () => {
    const db = createTestDb();
    const app = buildApp(db);
    const admin = await cookieFor(db, { isAdmin: true, email: 'admin@x.com' });
    const res = await req(
      app,
      '/api/admin/users',
      'POST',
      { email: 'admin2@x.com', password: 'pw123456', displayName: 'A2', isAdmin: true },
      admin,
    );
    const a2 = ((await res.json()) as { user: { id: number } }).user.id;
    const list = (await (
      await app.request('/api/admin/users', { headers: { Cookie: admin } })
    ).json()) as { users: { id: number; email: string }[] };
    const a1 = list.users.find((u) => u.email === 'admin@x.com')!.id;

    // 有两个管理员：删掉 a2 成功。
    expect((await req(app, `/api/admin/users/${a2}`, 'DELETE', undefined, admin)).status).toBe(200);
    // 现在 a1 是最后一个启用管理员：删除被守卫拦下。
    expect((await req(app, `/api/admin/users/${a1}`, 'DELETE', undefined, admin)).status).toBe(409);
  });
});
