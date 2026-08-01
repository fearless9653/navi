import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createTestDb } from '../helpers/testDb';
import {
  countUsers,
  createUser,
  getUserByEmail,
  verifyCredentials,
  setPassword,
  listUsers,
  updateUser,
  deleteUser,
  countActiveAdmins,
} from '@/services/users';
import { needsRehash } from '@/services/password';
import { createSession } from '@/services/sessions';
import { users, userPrefs, searchEngines, sessions } from '@/db/schema';

/** 造一个 10 万迭代的旧格式哈希（与 password.ts 的 pbkdf2$iter$salt$hash 格式一致）。 */
function legacyHash(pw: string, iter = 100_000): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pw, salt, iter, 32, 'sha256');
  return `pbkdf2$${iter}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

describe('users service', () => {
  it('登录成功后把低迭代旧哈希透明升级（rehash），仍可正常登录', async () => {
    const db = createTestDb();
    const u = await createUser(db, { email: 'a@x.com', password: 'irrelevant', displayName: 'A' });
    const legacy = legacyHash('secret123', 50_000); // 迭代数低于当前强度的历史哈希
    db.update(users).set({ passwordHash: legacy }).where(eq(users.id, u.id)).run();
    expect(needsRehash(legacy)).toBe(true);

    const pub = await verifyCredentials(db, 'a@x.com', 'secret123');
    expect(pub).not.toBeNull();

    const after = db.select().from(users).where(eq(users.id, u.id)).get()!;
    expect(after.passwordHash).not.toBe(legacy);
    expect(needsRehash(after.passwordHash)).toBe(false); // 已升级到当前强度
    expect(await verifyCredentials(db, 'a@x.com', 'secret123')).not.toBeNull();
  });

  it('createUser 建立 user + prefs + 3 默认引擎，且脱敏', async () => {
    const db = createTestDb();
    const u = await createUser(db, {
      email: 'a@x.com',
      password: 'pw123456',
      displayName: 'A',
      isAdmin: true,
    });
    expect(u.isAdmin).toBe(true);
    expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
    expect(await countUsers(db)).toBe(1);

    const prefs = db.select().from(userPrefs).where(eq(userPrefs.userId, u.id)).get();
    expect(prefs?.recentCount).toBe(8);

    const engines = db.select().from(searchEngines).where(eq(searchEngines.userId, u.id)).all();
    expect(engines.length).toBe(3);
    expect(engines.filter((e) => e.isDefault).length).toBe(1);
  });

  it('verifyCredentials 正确/错误/停用', async () => {
    const db = createTestDb();
    const u = await createUser(db, { email: 'b@x.com', password: 'pw123456', displayName: 'B' });
    expect(await verifyCredentials(db, 'b@x.com', 'pw123456')).not.toBeNull();
    expect(await verifyCredentials(db, 'b@x.com', 'wrong')).toBeNull();
    await updateUser(db, u.id, { isActive: false });
    expect(await verifyCredentials(db, 'b@x.com', 'pw123456')).toBeNull();
  });

  it('setPassword 换密并清 mustChangePassword', async () => {
    const db = createTestDb();
    const u = await createUser(db, {
      email: 'c@x.com',
      password: 'old12345',
      displayName: 'C',
      mustChangePassword: true,
    });
    await setPassword(db, u.id, 'new12345', { clearMustChange: true });
    expect(await verifyCredentials(db, 'c@x.com', 'old12345')).toBeNull();
    expect(await verifyCredentials(db, 'c@x.com', 'new12345')).not.toBeNull();
    const fresh = await getUserByEmail(db, 'c@x.com');
    expect(fresh?.mustChangePassword).toBe(false);
  });

  it('listUsers 不含 passwordHash', async () => {
    const db = createTestDb();
    await createUser(db, { email: 'd@x.com', password: 'pw123456', displayName: 'D' });
    const list = await listUsers(db);
    expect(list.length).toBe(1);
    expect((list[0] as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('deleteUser 级联清 prefs/engines/sessions', async () => {
    const db = createTestDb();
    const u = await createUser(db, { email: 'e@x.com', password: 'pw123456', displayName: 'E' });
    await createSession(db, u.id);
    await deleteUser(db, u.id);
    expect(await countUsers(db)).toBe(0);
    expect(db.select().from(userPrefs).where(eq(userPrefs.userId, u.id)).all().length).toBe(0);
    expect(db.select().from(searchEngines).where(eq(searchEngines.userId, u.id)).all().length).toBe(
      0,
    );
    expect(db.select().from(sessions).where(eq(sessions.userId, u.id)).all().length).toBe(0);
  });

  it('countActiveAdmins 统计启用管理员', async () => {
    const db = createTestDb();
    await createUser(db, {
      email: 'adm@x.com',
      password: 'pw123456',
      displayName: 'Adm',
      isAdmin: true,
    });
    await createUser(db, { email: 'usr@x.com', password: 'pw123456', displayName: 'Usr' });
    expect(await countActiveAdmins(db)).toBe(1);
  });
});
