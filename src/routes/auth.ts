import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { getCookie } from 'hono/cookie';
import type { DB } from '@/db/client';
import {
  type AppEnv,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from '@/middleware/auth';
import type { RateLimiter } from '@/middleware/rateLimit';
import { verifyCredentials, setPassword } from '@/services/users';
import { createSession, deleteSession, deleteUserSessions } from '@/services/sessions';

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
const changePwSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export function authRoutes(
  db: DB,
  opts: {
    secureCookie: boolean;
    loginLimiter: RateLimiter;
    clientIp?: (c: Context<AppEnv>) => string;
  },
) {
  const app = new Hono<AppEnv>();

  app.post('/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);

    // 按可信来源 IP + 邮箱限流；IP 来自入口注入（Node socket / CF-Connecting-IP），不信任 X-Forwarded-For。
    const ip = opts.clientIp?.(c) ?? 'local';
    const key = `${ip}:${parsed.data.email}`;
    const limit = opts.loginLimiter.check(key);
    if (!limit.ok)
      return c.json({ error: 'too_many_attempts', retryAfterMs: limit.retryAfterMs }, 429);

    const user = await verifyCredentials(db, parsed.data.email, parsed.data.password);
    if (!user) return c.json({ error: 'invalid_credentials' }, 401);

    opts.loginLimiter.reset(key);
    const token = await createSession(db, user.id);
    setSessionCookie(c, token, opts.secureCookie);
    return c.json({ user, mustChangePassword: user.mustChangePassword });
  });

  app.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await deleteSession(db, token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.post('/logout-all', requireAuth, async (c) => {
    const user = c.get('user')!;
    await deleteUserSessions(db, user.id);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }));

  app.post('/change-password', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = changePwSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const current = c.get('user')!;
    const ok = await verifyCredentials(db, current.email, parsed.data.currentPassword);
    if (!ok) return c.json({ error: 'wrong_password' }, 400);
    await setPassword(db, current.id, parsed.data.newPassword, { clearMustChange: true });
    // 改密后吊销该用户全部会话（踢掉其他设备/已泄漏的 token），再为当前设备重签新会话（轮换 token）。
    await deleteUserSessions(db, current.id);
    const token = await createSession(db, current.id);
    setSessionCookie(c, token, opts.secureCookie);
    return c.json({ ok: true });
  });

  return app;
}
