import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, requireAuth } from '@/middleware/auth';
import {
  listTags,
  listTagsByParent,
  createTag,
  updateTag,
  deleteTag,
  bulkDeleteTags,
  getTag,
} from '@/services/tags';
import { LimitExceededError } from '@/services/limits';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.number().int().nullable().optional(),
});
const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.number().int().nullable().optional(),
});
const bulkSchema = z.object({ ids: z.array(z.number().int()).max(1000) });

/** 标签路由（需登录；userId 取自会话）。 */
export function tagRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.get('/', async (c) => {
    const parentIdParam = c.req.query('parent_id');
    const parentId =
      parentIdParam === 'null' || parentIdParam === ''
        ? null
        : parentIdParam
          ? Number(parentIdParam)
          : undefined;
    // NaN 会在 SQL 绑定时报错，提前拒绝。
    if (parentId !== undefined && parentId !== null && !Number.isInteger(parentId)) {
      return c.json({ error: 'invalid_id' }, 400);
    }

    // parent_id 未传 → 返回全部（兼容旧前端）
    // parent_id=null → 返回根标签
    // parent_id=123 → 返回该父节点的子标签
    const tags =
      parentId === undefined
        ? await listTags(db, c.get('user')!.id)
        : await listTagsByParent(db, c.get('user')!.id, parentId);

    return c.json({ tags });
  });

  app.post('/', async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    try {
      const tag = await createTag(db, c.get('user')!.id, parsed.data);
      return c.json({ tag }, 201);
    } catch (e) {
      if (e instanceof LimitExceededError) {
        return c.json({ error: 'limit_exceeded', resource: e.resource, limit: e.limit }, 409);
      }
      return c.json({ error: 'create_failed', message: (e as Error).message }, 400);
    }
  });

  app.post('/bulk-delete', async (c) => {
    const parsed = bulkSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    await bulkDeleteTags(db, c.get('user')!.id, parsed.data.ids);
    return c.json({ ok: true });
  });

  app.patch('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    if (!(await getTag(db, userId, id))) return c.json({ error: 'not_found' }, 404);
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    try {
      await updateTag(db, userId, id, parsed.data);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: 'update_failed', message: (e as Error).message }, 400);
    }
  });

  app.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    if (!(await getTag(db, userId, id))) return c.json({ error: 'not_found' }, 404);
    await deleteTag(db, userId, id);
    return c.json({ ok: true });
  });

  return app;
}
