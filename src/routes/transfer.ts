import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { type AppEnv, requireAuth } from '@/middleware/auth';
import { exportData, importData } from '@/services/transfer';
import { LimitExceededError } from '@/services/limits';
import { verifyCredentials } from '@/services/users';
import { musicPlaylistSchema, sloganSchema } from './schemas';

// 导出/导入为敏感操作（整库读出 / 覆盖），除会话外再要求当前密码二次确认。
const exportSchema = z.object({ password: z.string().min(1) });

const importSchema = z.object({
  password: z.string().min(1),
  mode: z.enum(['merge', 'replace']),
  data: z.object({
    version: z.number().optional(),
    tags: z.array(z.object({ path: z.string().min(1) })).optional(),
    bookmarks: z
      .array(
        z.object({
          // 导入场景刻意宽松：只要求非空，不强校验 URL 格式，便于迁移/恢复
          // 历史或第三方导出文件中可能存在不完全合规的地址。
          url: z.string().min(1),
          name: z.string().min(1),
          description: z.string().nullable().optional(),
          faviconUrl: z.string().min(1).nullable().optional(),
          weight: z.number().int().optional(),
          isActive: z.boolean().optional(),
          tagPaths: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    engines: z
      .array(
        z.object({
          name: z.string().min(1),
          urlTemplate: z.string().min(1),
          iconUrl: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
          isDefault: z.boolean().optional(),
        }),
      )
      .optional(),
    prefs: z
      .object({
        // 与 /prefs PATCH 的钳制范围一致，防止导入绕过偏好校验写入越界值。
        recentCount: z.number().int().min(1).max(50),
        pageSize: z.number().int().min(1).max(100),
        defaultSort: z.string(),
        // 背景相关字段可选，兼容新增字段前导出的旧文件。
        backgroundType: z.enum(['none', 'bing', 'custom']).optional(),
        backgroundImageUrl: z.string().nullable().optional(),
        backgroundOpacityLight: z.number().int().min(0).max(100).optional(),
        backgroundOpacityDark: z.number().int().min(0).max(100).optional(),
        musicPlaylist: musicPlaylistSchema.optional(),
        slogan: sloganSchema.optional(),
      })
      .optional(),
  }),
});

/**
 * 导入导出路由。挂载于 `/api`，故用**逐路由** requireAuth，
 * 避免广域 `use('*')` 误伤 /api/auth/login 等公开端点。
 */
export function transferRoutes(db: DB) {
  const app = new Hono<AppEnv>();

  app.post('/export', requireAuth, async (c) => {
    const parsed = exportSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const user = c.get('user')!;
    const ok = await verifyCredentials(db, user.email, parsed.data.password);
    if (!ok) return c.json({ error: 'wrong_password' }, 400);
    return c.json(await exportData(db, user.id));
  });

  app.post('/import', requireAuth, async (c) => {
    const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid', issues: parsed.error.issues }, 400);
    const user = c.get('user')!;
    const ok = await verifyCredentials(db, user.email, parsed.data.password);
    if (!ok) return c.json({ error: 'wrong_password' }, 400);
    try {
      const result = await importData(db, user.id, parsed.data);
      return c.json(result);
    } catch (e) {
      if (e instanceof LimitExceededError) {
        return c.json({ error: 'limit_exceeded', resource: e.resource, limit: e.limit }, 409);
      }
      throw e;
    }
  });

  return app;
}
