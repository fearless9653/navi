import { eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { userPrefs } from '@/db/schema';

export type Prefs = typeof userPrefs.$inferSelect;

const prefsCache = new WeakMap<DB, Map<number, Prefs>>();

function clonePrefs(prefs: Prefs): Prefs {
  return { ...prefs };
}

function getCachedPrefs(db: DB, userId: number): Prefs | null {
  const cached = prefsCache.get(db)?.get(userId);
  return cached ? clonePrefs(cached) : null;
}

function setCachedPrefs(db: DB, userId: number, prefs: Prefs): void {
  let dbCache = prefsCache.get(db);
  if (!dbCache) {
    dbCache = new Map();
    prefsCache.set(db, dbCache);
  }
  dbCache.set(userId, clonePrefs(prefs));
}

export function invalidatePrefsCache(db: DB, userId: number): void {
  prefsCache.get(db)?.delete(userId);
}

/** 读取用户偏好；若缺则懒建默认行。 */
export async function getPrefs(db: DB, userId: number): Promise<Prefs> {
  const cached = getCachedPrefs(db, userId);
  if (cached) return cached;

  const existing = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).get();
  if (existing) {
    setCachedPrefs(db, userId, existing);
    return clonePrefs(existing);
  }
  // 懒建默认行：onConflictDoNothing 防并发（两个请求同时 miss 后各自插入）撞唯一索引；
  // 冲突时 returning 为空，回退重查。
  const inserted = await db
    .insert(userPrefs)
    .values({ userId })
    .onConflictDoNothing()
    .returning()
    .get();
  if (inserted) {
    setCachedPrefs(db, userId, inserted);
    return clonePrefs(inserted);
  }
  const row = (await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).get())!;
  setCachedPrefs(db, userId, row);
  return clonePrefs(row);
}

export interface MusicTrackInput {
  url: string;
  name: string;
}

export interface UpdatePrefsInput {
  recentCount?: number;
  pageSize?: number;
  defaultSort?: string;
  backgroundType?: 'none' | 'bing' | 'custom';
  backgroundImageUrl?: string | null;
  backgroundOpacityLight?: number;
  backgroundOpacityDark?: number;
  musicPlaylist?: MusicTrackInput[];
  slogan?: string | null;
}

export async function updatePrefs(db: DB, userId: number, input: UpdatePrefsInput): Promise<Prefs> {
  await getPrefs(db, userId); // 确保行存在
  const patch: Partial<typeof userPrefs.$inferInsert> = { lastModifiedDate: new Date() };
  if (input.recentCount !== undefined) patch.recentCount = input.recentCount;
  if (input.pageSize !== undefined) patch.pageSize = input.pageSize;
  if (input.defaultSort !== undefined) patch.defaultSort = input.defaultSort;
  if (input.backgroundType !== undefined) patch.backgroundType = input.backgroundType;
  if (input.backgroundImageUrl !== undefined) patch.backgroundImageUrl = input.backgroundImageUrl;
  if (input.backgroundOpacityLight !== undefined)
    patch.backgroundOpacityLight = input.backgroundOpacityLight;
  if (input.backgroundOpacityDark !== undefined)
    patch.backgroundOpacityDark = input.backgroundOpacityDark;
  if (input.musicPlaylist !== undefined) patch.musicPlaylist = JSON.stringify(input.musicPlaylist);
  if (input.slogan !== undefined) patch.slogan = input.slogan;
  await db.update(userPrefs).set(patch).where(eq(userPrefs.userId, userId)).run();
  invalidatePrefsCache(db, userId);
  return getPrefs(db, userId);
}
