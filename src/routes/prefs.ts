import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, requireAuth } from '@/middleware/auth';
import { getPrefs, updatePrefs } from '@/services/prefs';
import { musicPlaylistSchema, sloganSchema } from './schemas';

const patchSchema = z.object({
  recentCount: z.number().int().min(1).max(50).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  defaultSort: z.enum(['weight', 'name', 'recent', 'created', 'updated', 'visits']).optional(),
  backgroundType: z.enum(['none', 'bing', 'custom']).optional(),
  backgroundImageUrl: z.union([z.string().url(), z.null()]).optional(),
  backgroundOpacityLight: z.number().int().min(0).max(100).optional(),
  backgroundOpacityDark: z.number().int().min(0).max(100).optional(),
  musicPlaylist: musicPlaylistSchema.optional(),
  slogan: sloganSchema.optional(),
});

/** 用户偏好路由（需登录）。 */
export function prefsRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.get('/', async (c) => c.json({ prefs: await getPrefs(db, c.get('user')!.id) }));

  app.patch('/', async (c) => {
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    return c.json({ prefs: await updatePrefs(db, c.get('user')!.id, parsed.data) });
  });

  return app;
}
