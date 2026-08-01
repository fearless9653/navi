import { and, eq, lte } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { sessions } from '@/db/schema';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
const RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 剩余不足 7 天则续期

interface CachedSession {
  userId: number;
  expiresAt: Date;
}

/** 会话校验结果：有效会话返回用户及（可能已续期的）过期时间。 */
export interface SessionResult {
  userId: number;
  expiresAt: Date;
  /** 本次校验是否发生了续期（发生时调用方需刷新 cookie）。 */
  renewed: boolean;
}

const sessionCache = new WeakMap<DB, Map<string, CachedSession>>();

function getDbSessionCache(db: DB): Map<string, CachedSession> {
  let dbCache = sessionCache.get(db);
  if (!dbCache) {
    dbCache = new Map();
    sessionCache.set(db, dbCache);
  }
  return dbCache;
}

function setCachedSession(db: DB, token: string, userId: number, expiresAt: Date): void {
  getDbSessionCache(db).set(token, { userId, expiresAt });
}

export function invalidateSessionCache(db: DB, token: string): void {
  sessionCache.get(db)?.delete(token);
}

export function invalidateUserSessionCache(db: DB, userId: number): void {
  const dbCache = sessionCache.get(db);
  if (!dbCache) return;
  for (const [token, cached] of dbCache.entries()) {
    if (cached.userId === userId) dbCache.delete(token);
  }
}

/** 32 字节随机十六进制 token。 */
export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 删除某用户所有已过期的会话（含缓存）。 */
export async function deleteExpiredUserSessions(
  db: DB,
  userId: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now)))
    .run();
  const dbCache = sessionCache.get(db);
  if (!dbCache) return;
  for (const [token, cached] of dbCache.entries()) {
    if (cached.userId === userId && cached.expiresAt.getTime() <= now.getTime())
      dbCache.delete(token);
  }
}

export async function createSession(
  db: DB,
  userId: number,
  now: Date = new Date(),
): Promise<string> {
  const id = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt, createdAt: now }).run();
  // 登录时顺带清理该用户遗留的过期会话。
  await deleteExpiredUserSessions(db, userId, now);
  return id;
}

/** 续期：把过期时间推到 now+30 天，更新库与缓存，并清理该用户的过期会话。 */
async function renewSession(db: DB, token: string, userId: number, now: Date): Promise<Date> {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, token)).run();
  setCachedSession(db, token, userId, expiresAt);
  await deleteExpiredUserSessions(db, userId, now);
  return expiresAt;
}

/** 判断是否需要续期（剩余不足阈值）。 */
function needsRenewal(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < RENEW_THRESHOLD_MS;
}

/**
 * 返回有效会话结果；不存在或已过期返回 null（过期会顺手删除）。
 * 剩余时间不足阈值时自动续期，结果中 renewed=true。
 */
export async function getSessionUserId(
  db: DB,
  token: string,
  now: Date = new Date(),
): Promise<SessionResult | null> {
  const cached = sessionCache.get(db)?.get(token);
  if (cached) {
    if (cached.expiresAt.getTime() <= now.getTime()) {
      sessionCache.get(db)?.delete(token);
      // 落到下面的库查询，让过期删除与清理逻辑统一处理。
    } else if (needsRenewal(cached.expiresAt, now)) {
      const expiresAt = await renewSession(db, token, cached.userId, now);
      return { userId: cached.userId, expiresAt, renewed: true };
    } else {
      return { userId: cached.userId, expiresAt: cached.expiresAt, renewed: false };
    }
  }

  const row = await db.select().from(sessions).where(eq(sessions.id, token)).get();
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, token)).run();
    invalidateSessionCache(db, token);
    return null;
  }
  if (needsRenewal(row.expiresAt, now)) {
    const expiresAt = await renewSession(db, token, row.userId, now);
    return { userId: row.userId, expiresAt, renewed: true };
  }
  setCachedSession(db, token, row.userId, row.expiresAt);
  return { userId: row.userId, expiresAt: row.expiresAt, renewed: false };
}

export async function deleteSession(db: DB, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token)).run();
  invalidateSessionCache(db, token);
}

export async function deleteUserSessions(db: DB, userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId)).run();
  invalidateUserSessionCache(db, userId);
}
