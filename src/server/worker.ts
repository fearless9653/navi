import { createD1Db, type D1DB } from '@/db/client';
import { createApp } from '@/app';
import { fetchMetadata } from '@/services/fetcher';

interface Env {
  DB: import('@cloudflare/workers-types').D1Database;
  ASSETS: {
    fetch(request: Request): Response | Promise<Response>;
  };
}

// 模块级缓存：同一 isolate 复用期间共享 DB 与 app 实例——service 层内存缓存跨请求生效，
// 且不必每请求重建路由树；app 内状态（登录限流器）也随 isolate 存续，否则限流形同虚设。
let cachedApp: ReturnType<typeof createApp> | null = null;
let lastD1: import('@cloudflare/workers-types').D1Database | null = null;

function getApp(d1: import('@cloudflare/workers-types').D1Database): ReturnType<typeof createApp> {
  if (!cachedApp || lastD1 !== d1) {
    const db: D1DB = createD1Db(d1);
    // Workers 上无 DNS lookup（依赖平台出口 + 字面量 SSRF 校验）。
    cachedApp = createApp(db, {
      secureCookie: true,
      fetchMeta: (url) => fetchMetadata(url, { fetchImpl: fetch, lookup: undefined }),
      // 登录限流按 CF 边缘注入的真实客户端 IP 计数（客户端不可伪造）。
      clientIp: (c) => c.req.header('cf-connecting-ip') ?? 'local',
    });
    lastD1 = d1;
  }
  return cachedApp;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/api' && !pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    return getApp(env.DB).fetch(request, env);
  },
};
