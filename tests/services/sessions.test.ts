import { describe, it, expect } from 'vitest';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import {
  createSession,
  getSessionUserId,
  deleteSession,
  deleteExpiredUserSessions,
} from '@/services/sessions';
import { sessions, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

function seedUser(db: NodeDB, email = 'u@x.com'): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

const DAY = 24 * 60 * 60 * 1000;

describe('sessions', () => {
  it('创建后能取回 userId', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    const token = await createSession(db, uid);
    const result = await getSessionUserId(db, token);
    expect(result?.userId).toBe(uid);
    expect(result?.renewed).toBe(false);
  });

  it('过期会话返回 null 并被清除', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    const longAgo = new Date(Date.now() - 60 * DAY); // 60 天前创建 → 已过期
    const token = await createSession(db, uid, longAgo);
    expect(await getSessionUserId(db, token)).toBeNull();
    expect(await getSessionUserId(db, token)).toBeNull(); // 已删，再查仍 null
  });

  it('删除后取回 null', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    const token = await createSession(db, uid);
    await deleteSession(db, token);
    expect(await getSessionUserId(db, token)).toBeNull();
  });

  it('getSessionUserId 缓存有效会话并在删除后失效', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    const token = await createSession(db, uid);

    const originalSelect = db.select.bind(db);
    let selectCalls = 0;
    db.select = ((...args: Parameters<typeof db.select>) => {
      selectCalls += 1;
      return originalSelect(...args);
    }) as typeof db.select;

    expect((await getSessionUserId(db, token))?.userId).toBe(uid);
    const callsAfterFirst = selectCalls;
    expect((await getSessionUserId(db, token))?.userId).toBe(uid);

    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(selectCalls).toBe(callsAfterFirst);

    await deleteSession(db, token);
    expect(await getSessionUserId(db, token)).toBeNull();
  });

  it('无效 token 返回 null', async () => {
    const db = createTestDb();
    expect(await getSessionUserId(db, 'nope')).toBeNull();
  });

  it('剩余时间不足 7 天时自动续期（查库路径）', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    // 27 天前创建 → 剩余 3 天，低于 7 天阈值。
    const created = new Date(Date.now() - 27 * DAY);
    const token = await createSession(db, uid, created);

    const result = await getSessionUserId(db, token);
    expect(result?.userId).toBe(uid);
    expect(result?.renewed).toBe(true);

    // 库中过期时间应被推到约 now+30 天。
    const row = db.select().from(sessions).where(eq(sessions.id, token)).get()!;
    const remaining = row.expiresAt.getTime() - Date.now();
    expect(remaining).toBeGreaterThan(29 * DAY);
    expect(remaining).toBeLessThanOrEqual(30 * DAY + 1000);
  });

  it('剩余时间充足时不续期', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    const token = await createSession(db, uid); // 剩余 30 天
    const result = await getSessionUserId(db, token);
    expect(result?.renewed).toBe(false);
  });

  it('缓存命中时也会触发续期', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    const created = new Date(); // 剩余 30 天，expiresAt = created + 30 天
    const token = await createSession(db, uid, created);

    // 第一次在创建时刻查询：剩余充足，填充缓存，不续期。
    const first = await getSessionUserId(db, token, created);
    expect(first?.renewed).toBe(false);

    // 第二次推进到 created+25 天：命中缓存，剩余 5 天 < 7 天阈值 → 续期。
    const later = new Date(created.getTime() + 25 * DAY);
    const originalSelect = db.select.bind(db);
    let selectCalls = 0;
    db.select = ((...args: Parameters<typeof db.select>) => {
      selectCalls += 1;
      return originalSelect(...args);
    }) as typeof db.select;

    const renewed = await getSessionUserId(db, token, later);
    expect(renewed?.renewed).toBe(true);
    expect(renewed?.userId).toBe(uid);
    // 续期决策走的是缓存，不应再触发对 sessions 的 select 查询。
    expect(selectCalls).toBe(0);

    // 库中过期时间应被推到 later+30 天。
    const row = db.select().from(sessions).where(eq(sessions.id, token)).get()!;
    const remaining = row.expiresAt.getTime() - later.getTime();
    expect(remaining).toBeGreaterThan(29 * DAY);
    expect(remaining).toBeLessThanOrEqual(30 * DAY + 1000);
  });

  it('deleteExpiredUserSessions 只删该用户的过期会话', async () => {
    const db = createTestDb();
    const uid = seedUser(db, 'a@x.com');
    const other = seedUser(db, 'b@x.com');

    const expired = await createSession(db, uid, new Date(Date.now() - 60 * DAY));
    const valid = await createSession(db, uid);
    const otherExpired = await createSession(db, other, new Date(Date.now() - 60 * DAY));

    await deleteExpiredUserSessions(db, uid);

    expect(db.select().from(sessions).where(eq(sessions.id, expired)).get()).toBeUndefined();
    expect(db.select().from(sessions).where(eq(sessions.id, valid)).get()).toBeDefined();
    // 其他用户的过期会话不受影响。
    expect(db.select().from(sessions).where(eq(sessions.id, otherExpired)).get()).toBeDefined();
  });

  it('登录时清理本用户遗留的过期会话', async () => {
    const db = createTestDb();
    const uid = seedUser(db);
    const expired = await createSession(db, uid, new Date(Date.now() - 60 * DAY));
    // 再次登录（新建会话）应清掉上面那条过期会话。
    await createSession(db, uid);
    expect(db.select().from(sessions).where(eq(sessions.id, expired)).get()).toBeUndefined();
  });
});
