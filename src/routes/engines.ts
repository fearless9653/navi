import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, requireAuth } from '@/middleware/auth';
import {
  listEngines,
  createEngine,
  updateEngine,
  deleteEngine,
  setDefaultEngine,
  reorderEngines,
  getEngine,
} from '@/services/engines';
import { LimitExceededError } from '@/services/limits';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  urlTemplate: z.string().min(1).max(2048),
  iconUrl: z.string().max(2048).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
});
const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  urlTemplate: z.string().min(1).max(2048).optional(),
  iconUrl: z.string().max(2048).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
});
const reorderSchema = z.object({ ids: z.array(z.number().int()).min(1).max(1000) });

/** 搜索引擎路由（需登录）。 */
export function engineRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.get('/', async (c) => c.json({ engines: await listEngines(db, c.get('user')!.id) }));

  app.post('/', async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    try {
      const engine = await createEngine(db, c.get('user')!.id, parsed.data);
      return c.json({ engine }, 201);
    } catch (e) {
      if (e instanceof LimitExceededError) {
        return c.json({ error: 'limit_exceeded', resource: e.resource, limit: e.limit }, 409);
      }
      return c.json({ error: 'invalid_template', message: (e as Error).message }, 400);
    }
  });

  app.post('/reorder', async (c) => {
    const parsed = reorderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    await reorderEngines(db, c.get('user')!.id, parsed.data.ids);
    return c.json({ ok: true });
  });

  app.patch('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    if (!(await getEngine(db, userId, id))) return c.json({ error: 'not_found' }, 404);
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    try {
      await updateEngine(db, userId, id, parsed.data);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: 'invalid_template', message: (e as Error).message }, 400);
    }
  });

  app.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    if (!(await getEngine(db, userId, id))) return c.json({ error: 'not_found' }, 404);
    await deleteEngine(db, userId, id);
    return c.json({ ok: true });
  });

  app.post('/:id/default', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    if (!(await getEngine(db, userId, id))) return c.json({ error: 'not_found' }, 404);
    await setDefaultEngine(db, userId, id);
    return c.json({ ok: true });
  });

  return app;
}
