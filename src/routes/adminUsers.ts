import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, requireAuth, requireAdmin } from '@/middleware/auth';
import {
  listUsers,
  createUser,
  updateUser,
  updateUserIfNotLastAdmin,
  deleteUserIfNotLastAdmin,
  getUserById,
  setPassword,
} from '@/services/users';
import { deleteUserSessions } from '@/services/sessions';

const createSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(100),
  isAdmin: z.boolean().optional(),
});

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  displayName: z.string().min(1).max(100).optional(),
  newPassword: z.string().min(8).max(200).optional(),
});

/** 管理员账号管理（全部需登录且为管理员）。 */
export function adminUserRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth, requireAdmin);

  app.get('/', async (c) => c.json({ users: await listUsers(db) }));

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    try {
      const user = await createUser(db, { ...parsed.data, mustChangePassword: true });
      return c.json({ user }, 201);
    } catch {
      return c.json({ error: 'email_taken' }, 409);
    }
  });

  app.patch('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const target = await getUserById(db, id);
    if (!target) return c.json({ error: 'not_found' }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const { newPassword, ...fields } = parsed.data;

    // 摘除管理员 / 停用「最后一个启用管理员」用原子守卫拒绝（防 check-then-act 竞态导致 0 管理员锁死）。
    const removesAdmin =
      (fields.isAdmin === false || fields.isActive === false) && target.isAdmin && target.isActive;
    if (Object.keys(fields).length > 0) {
      if (removesAdmin) {
        const ok = await updateUserIfNotLastAdmin(db, id, fields);
        if (!ok) return c.json({ error: 'last_admin' }, 409);
      } else {
        await updateUser(db, id, fields);
      }
    }
    if (newPassword) await setPassword(db, id, newPassword, { clearMustChange: true });
    // 重置密码或停用账号后吊销该用户全部会话：重置强制其重新登录；停用则让在用 token 立即失效。
    if (newPassword || fields.isActive === false) await deleteUserSessions(db, id);
    return c.json({ ok: true });
  });

  app.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const target = await getUserById(db, id);
    if (!target) return c.json({ error: 'not_found' }, 404);

    // 原子守卫：拒绝删除最后一个启用管理员（非管理员/非最后一个则正常删除）。
    const ok = await deleteUserIfNotLastAdmin(db, id);
    if (!ok) return c.json({ error: 'last_admin' }, 409);
    return c.json({ ok: true });
  });

  return app;
}
