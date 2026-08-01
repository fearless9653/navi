import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, setSessionCookie } from '@/middleware/auth';
import { countUsers, createUser } from '@/services/users';
import { createSession } from '@/services/sessions';

const setupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(100),
});

/** 首启向导：库为空时创建首个管理员；已有用户则拒绝。 */
export function setupRoutes(db: DB, opts: { secureCookie: boolean }) {
  const app = new Hono<AppEnv>();

  app.get('/status', async (c) => {
    return c.json({ needsSetup: (await countUsers(db)) === 0 });
  });

  app.post('/', async (c) => {
    if ((await countUsers(db)) > 0) return c.json({ error: 'already_initialized' }, 409);
    const body = await c.req.json().catch(() => null);
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const user = await createUser(db, { ...parsed.data, isAdmin: true });
    const token = await createSession(db, user.id);
    setSessionCookie(c, token, opts.secureCookie);
    return c.json({ user }, 201);
  });

  return app;
}
