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
  asSuggestSource,
} from '@/services/engines';
import { LimitExceededError } from '@/services/limits';
import { fetchSuggestions } from '@/services/suggest';

const suggestSourceSchema = z.enum(['google', 'baidu']).nullable().optional();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  urlTemplate: z.string().min(1).max(2048),
  iconUrl: z.string().max(2048).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  suggestSource: suggestSourceSchema,
});
const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  urlTemplate: z.string().min(1).max(2048).optional(),
  iconUrl: z.string().max(2048).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  suggestSource: suggestSourceSchema,
});
const reorderSchema = z.object({ ids: z.array(z.number().int()).min(1).max(1000) });

const MAX_SUGGEST_Q_LENGTH = 200;

export interface EngineRouteOptions {
  /** 建议上游的 fetch 实现，便于测试注入、避免打真实网络。 */
  fetchImpl?: typeof fetch;
}

function writeError(e: unknown) {
  if (e instanceof LimitExceededError) {
    return {
      body: { error: 'limit_exceeded', resource: e.resource, limit: e.limit },
      status: 409 as const,
    };
  }
  const message = (e as Error).message;
  if (message === 'invalid_suggest_source') {
    return { body: { error: 'invalid_suggest_source' }, status: 400 as const };
  }
  return { body: { error: 'invalid_template', message }, status: 400 as const };
}

/** 搜索引擎路由（需登录）。 */
export function engineRoutes(db: DB, opts: EngineRouteOptions = {}) {
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
      const err = writeError(e);
      return c.json(err.body, err.status);
    }
  });

  app.post('/reorder', async (c) => {
    const parsed = reorderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    await reorderEngines(db, c.get('user')!.id, parsed.data.ids);
    return c.json({ ok: true });
  });

  // GET /:id/suggest 必须注册为独立路径，避免与 POST /reorder、POST /:id/default 互相覆盖。
  app.get('/:id/suggest', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    const engine = await getEngine(db, userId, id);
    if (!engine) return c.json({ error: 'not_found' }, 404);

    const q = (c.req.query('q') ?? '').trim().slice(0, MAX_SUGGEST_Q_LENGTH);
    const requestId = c.req.header('cf-ray') ?? undefined;
    if (!q) return c.json({ q, suggestions: [] as string[] });

    const source = asSuggestSource(engine.suggestSource);
    if (!source) return c.json({ q, suggestions: [] as string[] });

    const suggestions = await fetchSuggestions(source, q, { fetchImpl: opts.fetchImpl, requestId });
    return c.json({ q, suggestions });
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
      const err = writeError(e);
      return c.json(err.body, err.status);
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
