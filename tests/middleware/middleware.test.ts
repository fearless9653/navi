import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createTestDb } from '../helpers/testDb';
import { sessionAuth, requireAuth, requireAdmin, type AppEnv } from '@/middleware/auth';
import { createLoginRateLimiter } from '@/middleware/rateLimit';
import { createUser } from '@/services/users';
import { createSession } from '@/services/sessions';

describe('loginRateLimiter', () => {
  it('窗口内超阈值拒绝，窗口过后恢复，reset 清零', () => {
    const rl = createLoginRateLimiter({ max: 2, windowMs: 1000 });
    expect(rl.check('k', 0).ok).toBe(true);
    expect(rl.check('k', 100).ok).toBe(true);
    const blocked = rl.check('k', 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(rl.check('k', 1300).ok).toBe(true); // 首次尝试已超窗
    rl.reset('k');
    expect(rl.check('k', 1400).ok).toBe(true);
  });
});

describe('auth middleware', () => {
  async function buildApp(db: ReturnType<typeof createTestDb>) {
    const app = new Hono<AppEnv>();
    app.use('*', sessionAuth(db));
    app.get('/me', requireAuth, (c) => c.json({ ok: true }));
    app.get('/admin', requireAdmin, (c) => c.json({ ok: true }));
    return app;
  }

  it('无 cookie → requireAuth 401', async () => {
    const db = createTestDb();
    const app = await buildApp(db);
    expect((await app.request('/me')).status).toBe(401);
  });

  it('普通用户可访问 /me，但 /admin 403', async () => {
    const db = createTestDb();
    const app = await buildApp(db);
    const u = await createUser(db, { email: 'u@x.com', password: 'pw123456', displayName: 'U' });
    const token = await createSession(db, u.id);
    const h = { Cookie: `navi_session=${token}` };
    expect((await app.request('/me', { headers: h })).status).toBe(200);
    expect((await app.request('/admin', { headers: h })).status).toBe(403);
  });

  it('管理员可访问 /admin', async () => {
    const db = createTestDb();
    const app = await buildApp(db);
    const a = await createUser(db, {
      email: 'a@x.com',
      password: 'pw123456',
      displayName: 'A',
      isAdmin: true,
    });
    const token = await createSession(db, a.id);
    expect(
      (await app.request('/admin', { headers: { Cookie: `navi_session=${token}` } })).status,
    ).toBe(200);
  });
});
