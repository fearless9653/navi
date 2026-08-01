import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { DB } from '@/db/client';
import { getSessionUserId } from '@/services/sessions';
import { getUserById, type PublicUser } from '@/services/users';

export const SESSION_COOKIE = 'navi_session';

/** Hono 环境类型：当前用户挂在 c.var.user。 */
export type AppEnv = { Variables: { user: PublicUser | null } };

/** 解析会话 cookie，将当前（启用）用户注入 c.set('user', …)，否则置 null。
 *  会话剩余时间不足阈值时自动续期并刷新 cookie。 */
export function sessionAuth(db: DB, secure = false) {
  return createMiddleware<AppEnv>(async (c, next) => {
    let user: PublicUser | null = null;
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const result = await getSessionUserId(db, token);
      if (result) {
        const u = await getUserById(db, result.userId);
        if (u && u.isActive) {
          const { passwordHash: _omit, ...pub } = u;
          user = pub;
          if (result.renewed) setSessionCookie(c, token, secure);
        }
      }
    }
    c.set('user', user);
    await next();
  });
}

/** 未登录返回 401。 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

/** 非管理员返回 403（未登录 401）。 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  if (!user.isAdmin) return c.json({ error: 'forbidden' }, 403);
  await next();
});

/** 下发会话 cookie。生产环境应 secure=true。 */
export function setSessionCookie(c: Context, token: string, secure: boolean): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}

/** 清除会话 cookie。 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}
