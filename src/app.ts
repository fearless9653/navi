import { Hono } from 'hono';
import type { Context } from 'hono';
import { csrf } from 'hono/csrf';
import { bodyLimit } from 'hono/body-limit';
import type { DB } from '@/db/client';
import { sessionAuth, type AppEnv } from '@/middleware/auth';
import { createLoginRateLimiter } from '@/middleware/rateLimit';
import { setupRoutes } from '@/routes/setup';
import { authRoutes } from '@/routes/auth';
import { adminUserRoutes } from '@/routes/adminUsers';
import { tagRoutes } from '@/routes/tags';
import { bookmarkRoutes } from '@/routes/bookmarks';
import { engineRoutes } from '@/routes/engines';
import { prefsRoutes } from '@/routes/prefs';
import { fetchRoutes } from '@/routes/fetch';
import { transferRoutes } from '@/routes/transfer';
import { bingRoutes } from '@/routes/bing';
import { fetchMetadata, type FetchMetaFn } from '@/services/fetcher';

export interface AppOptions {
  /** 生产环境（https）应为 true，使会话 cookie 带 Secure。 */
  secureCookie?: boolean;
  /** 抓取实现（可注入；默认仅字面量 SSRF 校验，Node 入口可注入带 DNS 复核的版本）。 */
  fetchMeta?: FetchMetaFn;
  /** 搜索建议上游 fetch（可注入；默认全局 fetch，测试中避免打真实网络）。 */
  suggestFetch?: typeof fetch;
  /**
   * 取可信客户端 IP，用于登录限流按来源计数。
   * 不传则回落到不区分来源（仅按邮箱限流）。运行时相关：Node 用 socket 远端地址，
   * Workers 用 CF-Connecting-IP —— 刻意不读客户端可伪造的 X-Forwarded-For。
   */
  clientIp?: (c: Context<AppEnv>) => string;
}

/** 创建共享 Hono app（运行时无关；Node 与 Workers 入口都传入各自的 db）。 */
export function createApp(db: DB, opts: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const secureCookie = opts.secureCookie ?? false;
  const fetchMeta: FetchMetaFn = opts.fetchMeta ?? ((url, req) => fetchMetadata(url, { acceptLanguage: req?.acceptLanguage }));
  const loginLimiter = createLoginRateLimiter({ max: 10, windowMs: 15 * 60_000 });

  // 仅对 /api/* 施加同源校验与会话解析：静态资源（前端构建产物）无需鉴权，
  // 否则每个静态请求都会跑 sessionAuth（含临期续期的 DB 写）。写方法都在 /api 下，csrf 覆盖足够。
  app.use('/api/*', csrf()); // 同源校验（写方法）
  app.use('/api/*', sessionAuth(db, secureCookie));
  // 全局请求体上限：封顶超大 payload（内存/存储/解析成本）；8MB 足够最大导入文件，字段级另有 .max()。
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
  );
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
  });

  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.route('/api/setup', setupRoutes(db, { secureCookie }));
  app.route('/api/auth', authRoutes(db, { secureCookie, loginLimiter, clientIp: opts.clientIp }));
  app.route('/api/admin/users', adminUserRoutes(db));
  app.route('/api/tags', tagRoutes(db));
  app.route('/api/bookmarks', bookmarkRoutes(db, { fetchMeta }));
  app.route('/api/engines', engineRoutes(db, { fetchImpl: opts.suggestFetch }));
  app.route('/api/prefs', prefsRoutes(db));
  app.route('/api/fetch', fetchRoutes(db, { fetchMeta }));
  app.route('/api/bing', bingRoutes());
  app.route('/api', transferRoutes(db));

  return app;
}
