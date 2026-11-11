import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { createApp } from '@/app';
import { createNodeDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { resolveSecureCookie } from './config';
import { fetchMetadata } from '@/services/fetcher';

const dbFile = process.env.DATABASE_FILE ?? './navi.sqlite';
const db = createNodeDb(dbFile);
runMigrations(db); // 启动时应用迁移

// Node 侧抓取：带 DNS 解析复核（防 DNS rebinding 到私网）。
const nodeLookup = async (hostname: string): Promise<string[]> => {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => r.address);
};

// 为「已校验 IP」构造把连接钉死在该 IP 的 undici dispatcher：
// 防 DNS rebinding —— 校验解析与实际连接必须用同一个 IP，否则 undici 会二次独立解析。
// servername 仍取原主机名（undici 连接器保留），故 TLS 证书校验不破。
const makePinnedDispatcher = (ip: string): Agent => {
  const family = isIP(ip) || 4;
  // 自定义 lookup 强制解析到已校验 IP；兼容 autoSelectFamily（options.all=true 期望数组）与传统签名。
  const lookup = (
    _hostname: string,
    options: { all?: boolean } | undefined,
    callback: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void,
  ): void => {
    if (options?.all) callback(null, [{ address: ip, family }]);
    else callback(null, ip, family);
  };
  return new Agent({ connect: { lookup: lookup as never } });
};

const app = createApp(db, {
  secureCookie: resolveSecureCookie(process.env),
  // 必须用 undici 自带 fetch 配 undici Agent：Node 全局 fetch 用的是内置 undici，
  // 传入 npm undici 的 dispatcher 会因版本不一致报 UND_ERR_INVALID_ARG。
  fetchMeta: (url, req) =>
    fetchMetadata(url, {
      fetchImpl: undiciFetch as unknown as typeof fetch,
      lookup: nodeLookup,
      makeDispatcher: makePinnedDispatcher,
      acceptLanguage: req?.acceptLanguage,
    }),
  // 登录限流按 socket 远端地址计数（不信任可伪造的 X-Forwarded-For）。
  clientIp: (c) => getConnInfo(c).remote.address ?? 'local',
});

// 生产：托管前端构建产物（dist/client）+ SPA history 回退（API 路由已在前注册，优先匹配）。
const CLIENT_ROOT = './dist/client';
app.use('/*', serveStatic({ root: CLIENT_ROOT }));
app.get('/*', serveStatic({ path: `${CLIENT_ROOT}/index.html` }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Navi listening on http://localhost:${info.port}`);
});
