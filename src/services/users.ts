import { eq, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import {
  users,
  userPrefs,
  searchEngines,
  sessions,
  bookmarks,
  bookmarkTags,
  tags,
} from '@/db/schema';
import { runWrite } from '@/db/tx';
import { hashPassword, verifyPassword, needsRehash } from './password';
import { DEFAULT_SEARCH_ENGINES } from './defaultEngines';
import { invalidateEnginesCache } from './engines';
import { invalidatePrefsCache } from './prefs';
import { invalidateUserSessionCache } from './sessions';
import { invalidateTagCache } from './tags';

export type User = typeof users.$inferSelect;
export type PublicUser = Omit<User, 'passwordHash'>;

// 一个 dummy 哈希：登录未命中账号时也拿它跑一次校验，抹平「账号是否存在」的时间差（防枚举）。
// 惰性生成 + 只算一次：hashPassword 内部调 crypto.getRandomValues 生成盐，而 Workers 禁止在
// 全局作用域生成随机值（仅允许在请求处理器内），故不能在模块顶层预算——首次校验时才生成并缓存。
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  return (dummyHashPromise ??= hashPassword('navi-timing-equalizer-dummy'));
}

const usersByIdCache = new WeakMap<DB, Map<number, User>>();

function cloneUser(user: User): User {
  return { ...user };
}

function getCachedUserById(db: DB, id: number): User | null {
  const cached = usersByIdCache.get(db)?.get(id);
  return cached ? cloneUser(cached) : null;
}

function setCachedUserById(db: DB, user: User): void {
  let dbCache = usersByIdCache.get(db);
  if (!dbCache) {
    dbCache = new Map();
    usersByIdCache.set(db, dbCache);
  }
  dbCache.set(user.id, cloneUser(user));
}

function invalidateUserCache(db: DB, id: number): void {
  usersByIdCache.get(db)?.delete(id);
}

function toPublic(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

export async function countUsers(db: DB): Promise<number> {
  const row = await db
    .select({ c: sql<number>`count(*)` })
    .from(users)
    .get();
  return row?.c ?? 0;
}

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  isAdmin?: boolean;
  mustChangePassword?: boolean;
}

/** 建号：user + user_prefs + 3 个默认搜索引擎。先建 user 取 id，再批量建其余。 */
export async function createUser(db: DB, input: CreateUserInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  const created = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      isAdmin: input.isAdmin ?? false,
      mustChangePassword: input.mustChangePassword ?? false,
    })
    .returning()
    .get();
  await runWrite(db, [
    db.insert(userPrefs).values({ userId: created.id }),
    ...DEFAULT_SEARCH_ENGINES.map((e, i) =>
      db.insert(searchEngines).values({
        userId: created.id,
        name: e.name,
        urlTemplate: e.urlTemplate,
        iconUrl: e.iconUrl,
        sortOrder: i,
        isDefault: i === 0,
      }),
    ),
  ]);
  return toPublic(created);
}

export async function getUserByEmail(db: DB, email: string): Promise<User | null> {
  const row = await db.select().from(users).where(eq(users.email, email)).get();
  return row ?? null;
}

export async function getUserById(db: DB, id: number): Promise<User | null> {
  const cached = getCachedUserById(db, id);
  if (cached) return cached;

  const row = await db.select().from(users).where(eq(users.id, id)).get();
  if (row) setCachedUserById(db, row);
  return row ?? null;
}

/** 校验邮箱+密码；账号需存在且启用。返回脱敏用户或 null。 */
export async function verifyCredentials(
  db: DB,
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const user = await getUserByEmail(db, email);
  if (!user || !user.isActive) {
    // 账号不存在/停用时也跑一次等价的 PBKDF2，抹平响应时间差，避免据此枚举有效邮箱。
    await verifyPassword(password, await getDummyHash());
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  // 校验通过且旧哈希迭代数偏低 → 透明 rehash 到当前强度（不吊销会话、不动 lastModified）。
  if (needsRehash(user.passwordHash)) {
    const upgraded = await hashPassword(password);
    await db.update(users).set({ passwordHash: upgraded }).where(eq(users.id, user.id)).run();
    invalidateUserCache(db, user.id);
  }
  return toPublic(user);
}

export async function setPassword(
  db: DB,
  userId: number,
  newPassword: string,
  opts: { clearMustChange?: boolean } = {},
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  const patch: Partial<typeof users.$inferInsert> = { passwordHash, lastModifiedDate: new Date() };
  if (opts.clearMustChange) patch.mustChangePassword = false;
  await db.update(users).set(patch).where(eq(users.id, userId)).run();
  invalidateUserCache(db, userId);
}

export async function listUsers(db: DB): Promise<PublicUser[]> {
  const rows = await db.select().from(users).all();
  return rows.map(toPublic);
}

export interface UpdateUserInput {
  isActive?: boolean;
  isAdmin?: boolean;
  displayName?: string;
}

export async function updateUser(db: DB, id: number, input: UpdateUserInput): Promise<void> {
  const patch: Partial<typeof users.$inferInsert> = { lastModifiedDate: new Date() };
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.isAdmin !== undefined) patch.isAdmin = input.isAdmin;
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  await db.update(users).set(patch).where(eq(users.id, id)).run();
  invalidateUserCache(db, id);
}

/**
 * 「该用户不是最后一个启用管理员」的原子守卫条件：
 * 目标非启用管理员，或除它之外仍有其他启用管理员。子查询在写入时求值、SQLite 串行化写，
 * 故并发地删/降两个不同管理员时，后一条会看到已减少的计数而被拦下 —— 杜绝 check-then-act 竞态。
 */
function notLastActiveAdmin(id: number) {
  return sql`${users.id} = ${id} and (not (${users.isAdmin} = 1 and ${users.isActive} = 1) or (select count(*) from ${users} where ${users.isAdmin} = 1 and ${users.isActive} = 1) > 1)`;
}

/**
 * 原子删除用户（含级联），但拒绝删除「最后一个启用管理员」。返回是否已删除。
 * 先带守卫删 users 行，再以「行是否还在」判定结果（不依赖各驱动不一的 changes 计数）。
 */
export async function deleteUserIfNotLastAdmin(db: DB, id: number): Promise<boolean> {
  await db.delete(users).where(notLastActiveAdmin(id)).run();
  const still = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
  invalidateUserCache(db, id);
  if (still) return false; // 被守卫拦下：仍是最后一个启用管理员
  await deleteUser(db, id); // users 行已删，清理其余关联（对 users 的删除为 no-op）
  return true;
}

/**
 * 原子应用「摘除管理员 / 停用」类改动，但拒绝把最后一个启用管理员摘除/停用。返回是否已应用。
 * 供路由在 removesAdmin 场景调用；被拦下时不改任何字段、返回 false。
 */
export async function updateUserIfNotLastAdmin(
  db: DB,
  id: number,
  input: UpdateUserInput,
): Promise<boolean> {
  const patch: Partial<typeof users.$inferInsert> = { lastModifiedDate: new Date() };
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.isAdmin !== undefined) patch.isAdmin = input.isAdmin;
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  await db.update(users).set(patch).where(notLastActiveAdmin(id)).run();
  invalidateUserCache(db, id);
  const row = await db.select().from(users).where(eq(users.id, id)).get();
  if (!row) return true; // 不存在（路由已前置校验，理论不达）
  // 若请求要摘除 admin/停用却仍为 active admin，说明被守卫拦下。
  const blocked =
    (input.isAdmin === false && row.isAdmin) || (input.isActive === false && row.isActive);
  return !blocked;
}

/** 原子级联删除该用户的全部数据（纯写，bookmark_tags 用子查询避免事务内读）。 */
export async function deleteUser(db: DB, id: number): Promise<void> {
  await runWrite(db, [
    db
      .delete(bookmarkTags)
      .where(
        sql`${bookmarkTags.bookmarkId} in (select ${bookmarks.id} from ${bookmarks} where ${bookmarks.userId} = ${id})`,
      ),
    db.delete(bookmarks).where(eq(bookmarks.userId, id)),
    db.delete(tags).where(eq(tags.userId, id)),
    db.delete(searchEngines).where(eq(searchEngines.userId, id)),
    db.delete(userPrefs).where(eq(userPrefs.userId, id)),
    db.delete(sessions).where(eq(sessions.userId, id)),
    db.delete(users).where(eq(users.id, id)),
  ]);
  invalidateUserCache(db, id);
  invalidateUserSessionCache(db, id);
  invalidateTagCache(db, id);
  invalidateEnginesCache(db, id);
  invalidatePrefsCache(db, id);
}

/** 当前启用的管理员数量（用于"最后一个管理员不可删/不可停用"保护）。 */
export async function countActiveAdmins(db: DB): Promise<number> {
  const row = await db
    .select({ c: sql<number>`count(*)` })
    .from(users)
    .where(sql`${users.isAdmin} = 1 and ${users.isActive} = 1`)
    .get();
  return row?.c ?? 0;
}
