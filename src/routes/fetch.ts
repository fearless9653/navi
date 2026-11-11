import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, requireAuth } from '@/middleware/auth';
import type { FetchMetaFn } from '@/services/fetcher';

const metaSchema = z.object({ url: z.string().min(1) });

/** 抓取预填路由（需登录）。仅返回元数据、不落库。 */
export function fetchRoutes(_db: DB, opts: { fetchMeta: FetchMetaFn }) {
  const { fetchMeta } = opts;
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.post('/metadata', async (c) => {
    const parsed = metaSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    try {
      const metadata = await fetchMeta(parsed.data.url, {
        acceptLanguage: c.req.header('Accept-Language')?.trim() || undefined,
      });
      return c.json({ metadata });
    } catch (e) {
      // 不回显具体错误：其字符串（host_blocked_resolved / dns_no_result / 连接拒绝…）会成为内网探测 oracle。
      console.error('fetch metadata failed:', (e as Error).message);
      return c.json({ error: 'fetch_failed' }, 502);
    }
  });

  return app;
}
