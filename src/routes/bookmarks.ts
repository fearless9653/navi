import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, requireAuth } from '@/middleware/auth';
import {
  listBookmarks,
  createBookmark,
  getBookmark,
  updateBookmark,
  deleteBookmark,
  recordVisit,
  listRecent,
  listTops,
  clearRecent,
  clearRecentOne,
  bulkDeleteBookmarks,
  bulkAssignTags,
  bulkRemoveTags,
  type SortKey,
  type ListBookmarksOptions,
} from '@/services/bookmarks';
import { getPrefs } from '@/services/prefs';
import { LimitExceededError } from '@/services/limits';
import type { FetchMetaFn } from '@/services/fetcher';

const SORTS: SortKey[] = ['weight', 'name', 'recent', 'created', 'updated', 'visits'];
const STATUSES = ['active', 'inactive', 'all'] as const;

const createSchema = z.object({
  url: z.string().url().max(2048),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  faviconUrl: z.string().url().max(2048).nullable().optional(),
  weight: z.number().int().optional(),
  isActive: z.boolean().optional(),
  tagIds: z.array(z.number().int()).max(1000).optional(),
});
const patchSchema = z.object({
  url: z.string().url().max(2048).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  faviconUrl: z.string().url().max(2048).nullable().optional(),
  weight: z.number().int().optional(),
  isActive: z.boolean().optional(),
  tagIds: z.array(z.number().int()).max(1000).optional(),
});
const bulkDeleteSchema = z.object({ ids: z.array(z.number().int()).max(1000) });
const bulkTagsSchema = z.object({
  bookmarkIds: z.array(z.number().int()).max(1000),
  tagIds: z.array(z.number().int()).max(1000),
  op: z.enum(['assign', 'remove']),
});

/** 网址路由（需登录；userId 取自会话）。 */
export function bookmarkRoutes(db: DB, opts: { fetchMeta: FetchMetaFn }) {
  const { fetchMeta } = opts;
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  // —— 静态子路径优先注册 ——
  app.get('/recent', async (c) => {
    const userId = c.get('user')!.id;
    // 非法/缺省回退偏好值；上限 50 与 /top 及 recentCount 偏好的钳制同源。
    const q = Number(c.req.query('limit'));
    const limit =
      Number.isFinite(q) && q > 0 ? Math.min(q, 50) : (await getPrefs(db, userId)).recentCount;
    const detail = c.req.query('detail') === '1' || c.req.query('detail') === 'true';
    const items = detail
      ? await listRecent(db, userId, limit, true)
      : await listRecent(db, userId, limit);
    return c.json({ items });
  });

  // 首页三榜单（访问次数 / 自设权重 / 创建时间），只读。limit 上限对齐 recentCount 的 max(50)。
  app.get('/top', async (c) => {
    const q = Number(c.req.query('limit'));
    const limit = Number.isFinite(q) && q > 0 ? Math.min(q, 50) : 8;
    return c.json(await listTops(db, c.get('user')!.id, limit));
  });

  app.delete('/recent', async (c) => {
    await clearRecent(db, c.get('user')!.id);
    return c.json({ ok: true });
  });

  app.delete('/recent/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    await clearRecentOne(db, c.get('user')!.id, id);
    return c.json({ ok: true });
  });

  app.post('/bulk-delete', async (c) => {
    const parsed = bulkDeleteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const deleted = await bulkDeleteBookmarks(db, c.get('user')!.id, parsed.data.ids);
    return c.json({ deleted });
  });

  app.post('/bulk-tags', async (c) => {
    const parsed = bulkTagsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const userId = c.get('user')!.id;
    const { bookmarkIds, tagIds, op } = parsed.data;
    if (op === 'assign') await bulkAssignTags(db, userId, bookmarkIds, tagIds);
    else await bulkRemoveTags(db, userId, bookmarkIds, tagIds);
    return c.json({ ok: true });
  });

  // 批量刷新说明：逐条抓取，失败不阻塞整体，返回逐条结果。
  // —— 列表 / 新建 ——
  app.get('/', async (c) => {
    const userId = c.get('user')!.id;
    const tagsParam = c.req.query('tags');
    const tagIds = tagsParam
      ? tagsParam
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n))
      : undefined;
    const sortParam = c.req.query('sort');
    const sort = SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : undefined;
    const dirParam = c.req.query('dir');
    const dir = dirParam === 'asc' || dirParam === 'desc' ? dirParam : undefined;
    const statusParam = c.req.query('status');
    const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
      ? (statusParam as (typeof STATUSES)[number])
      : undefined;
    // 非数字（NaN）按缺省处理，避免把 NaN 传进 SQL limit/offset。
    const pageParam = Number(c.req.query('page'));
    const page = Number.isFinite(pageParam) ? pageParam : undefined;
    const pageSizeParam = Number(c.req.query('pageSize'));
    const pageSize = Number.isFinite(pageSizeParam) ? pageSizeParam : undefined;
    const query = c.req.query('q') ?? undefined;
    // detail=0 / detail=false → 精简分支（items 仅带 tagIds，不 join tags 表）
    const detailParam = c.req.query('detail');
    const base: Omit<ListBookmarksOptions, 'detail'> = {
      tagIds,
      query,
      sort,
      dir,
      status,
      page,
      pageSize,
    };
    if (detailParam === '0' || detailParam === 'false') {
      return c.json(await listBookmarks(db, userId, { ...base, detail: false }));
    }
    return c.json(await listBookmarks(db, userId, base));
  });

  app.post('/', async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const userId = c.get('user')!.id;
    try {
      const bm = await createBookmark(db, userId, parsed.data);
      return c.json({ bookmark: await getBookmark(db, userId, bm.id) }, 201);
    } catch (e) {
      if (e instanceof LimitExceededError) {
        return c.json({ error: 'limit_exceeded', resource: e.resource, limit: e.limit }, 409);
      }
      return c.json({ error: 'url_taken' }, 409);
    }
  });

  // —— 单条 ——
  app.get('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const bm = await getBookmark(db, c.get('user')!.id, id);
    if (!bm) return c.json({ error: 'not_found' }, 404);
    return c.json({ bookmark: bm });
  });

  app.patch('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const userId = c.get('user')!.id;
    if (!(await getBookmark(db, userId, id))) return c.json({ error: 'not_found' }, 404);
    try {
      await updateBookmark(db, userId, id, parsed.data);
      return c.json({ ok: true });
    } catch {
      return c.json({ error: 'url_taken' }, 409);
    }
  });

  app.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    if (!(await getBookmark(db, userId, id))) return c.json({ error: 'not_found' }, 404);
    await deleteBookmark(db, userId, id);
    return c.json({ ok: true });
  });

  app.post('/:id/visit', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    await recordVisit(db, c.get('user')!.id, id);
    return c.json({ ok: true });
  });

  // 单条抓取并更新（name / description / faviconUrl；有值则覆盖）。
  app.post('/:id/fetch', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.json({ error: 'invalid_id' }, 400);
    const userId = c.get('user')!.id;
    const bm = await getBookmark(db, userId, id);
    if (!bm) return c.json({ error: 'not_found' }, 404);
    try {
      const md = await fetchMeta(bm.url, {
        acceptLanguage: c.req.header('Accept-Language')?.trim() || undefined,
      });
      const patch: { description?: string; faviconUrl?: string; name?: string } = {};
      if (md.description !== null) patch.description = md.description;
      if (md.faviconUrl !== null) patch.faviconUrl = md.faviconUrl;
      if (md.title) patch.name = md.title;
      await updateBookmark(db, userId, id, patch);
      return c.json({ bookmark: await getBookmark(db, userId, id) });
    } catch (e) {
      // 不回显具体错误：其字符串会成为内网探测 oracle（同 /api/fetch/metadata）。
      console.error('bookmark fetch failed:', (e as Error).message);
      return c.json({ error: 'fetch_failed' }, 502);
    }
  });

  return app;
}
