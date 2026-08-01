import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { bookmarks, bookmarkTags, tags, searchEngines, userPrefs } from '@/db/schema';
import { runWrite } from '@/db/tx';
import { chunk, MAX_SQL_PARAMS } from '@/db/chunk';
import { invalidateTagCache, listTags } from './tags';
import { DEFAULT_BOOKMARK_WEIGHT, loadTagsByBookmark } from './bookmarks';
import { invalidateEnginesCache, listEngines } from './engines';
import { getPrefs, invalidatePrefsCache } from './prefs';
import { assertCountWithinLimit } from './limits';

export interface NaviExport {
  version: 1;
  exportedAt: string;
  tags: { path: string }[];
  bookmarks: {
    url: string;
    name: string;
    description: string | null;
    faviconUrl: string | null;
    weight: number;
    isActive: boolean;
    tagPaths: string[];
  }[];
  engines: {
    name: string;
    urlTemplate: string;
    iconUrl: string | null;
    sortOrder: number;
    isDefault: boolean;
  }[];
  prefs: {
    recentCount: number;
    pageSize: number;
    defaultSort: string;
    backgroundType: 'none' | 'bing' | 'custom';
    backgroundImageUrl: string | null;
    backgroundOpacityLight: number;
    backgroundOpacityDark: number;
    musicPlaylist: { url: string; name: string }[];
    slogan: string | null;
  };
}

/** 解析 musicPlaylist（DB 中按 JSON 文本存储）；非法内容回退空列表。 */
function parsePlaylist(raw: string): { url: string; name: string }[] {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t): t is { url: string; name: string } => {
        return (
          typeof t === 'object' &&
          t !== null &&
          typeof (t as { url?: unknown }).url === 'string' &&
          typeof (t as { name?: unknown }).name === 'string'
        );
      })
      .map((t) => ({ url: t.url, name: t.name }));
  } catch {
    return [];
  }
}

/** 导出当前用户的全部数据为自有 JSON。 */
export async function exportData(
  db: DB,
  userId: number,
  now: Date = new Date(),
): Promise<NaviExport> {
  const tagRows = await listTags(db, userId);
  const bmRows = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(asc(bookmarks.id))
    .all();
  const tagMap = await loadTagsByBookmark(
    db,
    bmRows.map((b) => b.id),
  );
  const engines = await listEngines(db, userId);
  const prefs = await getPrefs(db, userId);

  return {
    version: 1,
    exportedAt: now.toISOString(),
    tags: tagRows.map((t) => ({ path: t.path })),
    bookmarks: bmRows.map((b) => ({
      url: b.url,
      name: b.name,
      description: b.description,
      faviconUrl: b.faviconUrl,
      weight: b.weight,
      isActive: b.isActive,
      tagPaths: (tagMap.get(b.id) ?? []).map((t) => t.path),
    })),
    engines: engines.map((e) => ({
      name: e.name,
      urlTemplate: e.urlTemplate,
      iconUrl: e.iconUrl,
      sortOrder: e.sortOrder,
      isDefault: e.isDefault,
    })),
    prefs: {
      recentCount: prefs.recentCount,
      pageSize: prefs.pageSize,
      defaultSort: prefs.defaultSort,
      backgroundType: prefs.backgroundType,
      backgroundImageUrl: prefs.backgroundImageUrl,
      backgroundOpacityLight: prefs.backgroundOpacityLight,
      backgroundOpacityDark: prefs.backgroundOpacityDark,
      musicPlaylist: parsePlaylist(prefs.musicPlaylist),
      slogan: prefs.slogan,
    },
  };
}

export interface ImportData {
  version?: number;
  tags?: { path: string }[];
  bookmarks?: {
    url: string;
    name: string;
    description?: string | null;
    faviconUrl?: string | null;
    weight?: number;
    isActive?: boolean;
    tagPaths?: string[];
  }[];
  engines?: {
    name: string;
    urlTemplate: string;
    iconUrl?: string | null;
    sortOrder?: number;
    isDefault?: boolean;
  }[];
  prefs?: {
    recentCount: number;
    pageSize: number;
    defaultSort: string;
    backgroundType?: 'none' | 'bing' | 'custom';
    backgroundImageUrl?: string | null;
    backgroundOpacityLight?: number;
    backgroundOpacityDark?: number;
    musicPlaylist?: { url: string; name: string }[];
    slogan?: string | null;
  };
}

export interface ImportInput {
  mode: 'merge' | 'replace';
  data: ImportData;
}

export interface ImportResult {
  tagsCreated: number;
  bookmarksCreated: number;
  bookmarksSkipped: number;
}

/**
 * 导入：仅作用于 userId；不信任 data 内任何 id（标签按 path、书签按 url 重映射）。
 * - replace：清空本用户 tags/bookmarks（engines/prefs 仅当 data 提供才覆盖），再重建。
 * - merge：标签按 path upsert（补建祖先层级）、书签按 url 去重跳过。
 */
export async function importData(
  db: DB,
  userId: number,
  input: ImportInput,
  now: Date = new Date(),
): Promise<ImportResult> {
  const { mode, data } = input;

  // 收集所有需要的标签 path（含祖先前缀）。
  const allPaths = new Set<string>();
  const addWithAncestors = (p: string) => {
    let acc = '';
    for (const seg of p.split('/').filter(Boolean)) {
      acc = acc ? `${acc}/${seg}` : seg;
      allPaths.add(acc);
    }
  };
  for (const t of data.tags ?? []) addWithAncestors(t.path);
  for (const b of data.bookmarks ?? []) for (const tp of b.tagPaths ?? []) addWithAncestors(tp);

  // 预读现有数据（用于 merge 去重）。
  const existingTags = await listTags(db, userId);
  const existingUrls = new Set(
    (
      await db
        .select({ url: bookmarks.url })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId))
        .all()
    ).map((r) => r.url),
  );
  const existingEngineList = await listEngines(db, userId);
  const existingEngineNames = new Set(existingEngineList.map((e) => e.name));

  // —— 数量上限预检 ——
  // 在任何写入前算出「导入后」终态行数并据此拒绝：D1 导入非事务、逐条顺序写，
  // 若写到一半才触限会留下半份数据难以收拾，故预检失败则整批不写、抛 LimitExceededError。
  {
    const existingTagPaths = new Set(existingTags.map((t) => t.path));
    const importUrls = new Set((data.bookmarks ?? []).map((b) => b.url));
    const importEngines = data.engines ?? [];
    if (mode === 'replace') {
      // replace：tags/bookmarks 整体替换为导入内容；engines 仅当提供才覆盖，否则保留现有。
      assertCountWithinLimit('tags', allPaths.size);
      assertCountWithinLimit('bookmarks', importUrls.size);
      assertCountWithinLimit(
        'engines',
        importEngines.length > 0 ? importEngines.length : existingEngineList.length,
      );
    } else {
      // merge：现有 + 去重后的净增量。
      const newTags = [...allPaths].filter((p) => !existingTagPaths.has(p)).length;
      const newUrls = [...importUrls].filter((u) => !existingUrls.has(u)).length;
      const newEngines = importEngines.filter((e) => !existingEngineNames.has(e.name)).length;
      assertCountWithinLimit('tags', existingTags.length + newTags);
      assertCountWithinLimit('bookmarks', existingUrls.size + newUrls);
      assertCountWithinLimit('engines', existingEngineList.length + newEngines);
    }
  }

  let tagsCreated = 0;
  let bookmarksSkipped = 0;

  // 顺序执行（D1 无交互式事务；链式自增 id 无法放入单个 batch）。纯写删除走 runWrite。
  const pathToId = new Map<string, number>();

  if (mode === 'replace') {
    await runWrite(db, [
      db
        .delete(bookmarkTags)
        .where(
          sql`${bookmarkTags.bookmarkId} in (select ${bookmarks.id} from ${bookmarks} where ${bookmarks.userId} = ${userId})`,
        ),
      db.delete(bookmarks).where(eq(bookmarks.userId, userId)),
      db.delete(tags).where(eq(tags.userId, userId)),
    ]);
  } else {
    for (const t of existingTags) pathToId.set(t.path, t.id);
  }

  // 浅→深创建标签，保证父先于子（需上一条的自增 id，故顺序 await）。
  const sortedPaths = [...allPaths].sort(
    (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b),
  );
  for (const p of sortedPaths) {
    if (pathToId.has(p)) continue;
    const parts = p.split('/');
    const name = parts[parts.length - 1]!;
    const parentPath = parts.slice(0, -1).join('/');
    const parentId = parentPath ? (pathToId.get(parentPath) ?? null) : null;
    const row = await db.insert(tags).values({ userId, name, parentId, path: p }).returning().get();
    pathToId.set(p, row.id);
    tagsCreated++;
  }

  // 已写入的 url（replace 从空起，merge 含库中现有）：文件内重复 url 也按跳过处理，
  // 否则第二条会撞 (userId, url) 唯一索引，导入中途 500、留下半份数据。
  const writtenUrls = mode === 'merge' ? new Set(existingUrls) : new Set<string>();
  // 先筛出要新建的书签（跳过重复 url），再分片批量插入、按 url 回查 id 建关联，
  // 避免逐条 insert+returning 的大量往返（大导入在 D1 上尤慢）。
  const toCreate: NonNullable<ImportData['bookmarks']> = [];
  for (const b of data.bookmarks ?? []) {
    if (writtenUrls.has(b.url)) {
      bookmarksSkipped++;
      continue;
    }
    writtenUrls.add(b.url);
    toCreate.push(b);
  }
  const bookmarksCreated = toCreate.length;

  // 分片批量插入书签（每行 7 个绑定参数）。
  for (const part of chunk(toCreate, Math.floor(MAX_SQL_PARAMS / 7))) {
    await runWrite(db, [
      db.insert(bookmarks).values(
        part.map((b) => ({
          userId,
          url: b.url,
          name: b.name,
          description: b.description ?? null,
          faviconUrl: b.faviconUrl ?? null,
          weight: b.weight ?? DEFAULT_BOOKMARK_WEIGHT,
          isActive: b.isActive ?? true,
        })),
      ),
    ]);
  }

  // 回查刚插入书签的 url→id（url 在本用户下唯一，映射可靠）。
  const urlToId = new Map<string, number>();
  for (const part of chunk(toCreate.map((b) => b.url))) {
    const rows = await db
      .select({ id: bookmarks.id, url: bookmarks.url })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.url, part)))
      .all();
    for (const r of rows) urlToId.set(r.url, r.id);
  }

  // 构建 bookmark→tag 关联并分片批量插入（每行 2 个绑定参数）。
  const linkRows: { bookmarkId: number; tagId: number }[] = [];
  for (const b of toCreate) {
    const bid = urlToId.get(b.url);
    if (bid === undefined) continue;
    for (const tp of b.tagPaths ?? []) {
      // 与建标签时的 addWithAncestors 归一化一致（去空段），否则手改文件里如 "/a/b/" 取不到 id。
      const key = tp.split('/').filter(Boolean).join('/');
      const tid = pathToId.get(key);
      if (tid !== undefined) linkRows.push({ bookmarkId: bid, tagId: tid });
    }
  }
  for (const part of chunk(linkRows, Math.floor(MAX_SQL_PARAMS / 2))) {
    await runWrite(db, [db.insert(bookmarkTags).values(part).onConflictDoNothing()]);
  }

  if (data.engines && data.engines.length > 0) {
    if (mode === 'replace') {
      await runWrite(db, [
        db.delete(searchEngines).where(eq(searchEngines.userId, userId)),
        ...data.engines.map((e, i) =>
          db.insert(searchEngines).values({
            userId,
            name: e.name,
            urlTemplate: e.urlTemplate,
            iconUrl: e.iconUrl ?? null,
            sortOrder: e.sortOrder ?? i,
            isDefault: e.isDefault ?? false,
          }),
        ),
      ]);
    } else {
      const inserts = data.engines
        .filter((e) => !existingEngineNames.has(e.name))
        .map((e) =>
          db.insert(searchEngines).values({
            userId,
            name: e.name,
            urlTemplate: e.urlTemplate,
            iconUrl: e.iconUrl ?? null,
            sortOrder: e.sortOrder ?? 0,
            isDefault: false,
          }),
        );
      await runWrite(db, inserts);
    }
  }

  if (data.prefs) {
    const existing = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).get();
    if (existing) {
      await db
        .update(userPrefs)
        .set({
          recentCount: data.prefs.recentCount,
          pageSize: data.prefs.pageSize,
          defaultSort: data.prefs.defaultSort,
          // 背景相关字段为可选（兼容旧版导出文件）；undefined 时 Drizzle 会跳过该列，保留原值。
          backgroundType: data.prefs.backgroundType,
          backgroundImageUrl: data.prefs.backgroundImageUrl,
          backgroundOpacityLight: data.prefs.backgroundOpacityLight,
          backgroundOpacityDark: data.prefs.backgroundOpacityDark,
          // 歌单为可选；缺省时 undefined → Drizzle 跳过该列，保留原值。
          musicPlaylist: data.prefs.musicPlaylist
            ? JSON.stringify(data.prefs.musicPlaylist)
            : undefined,
          slogan: data.prefs.slogan,
          lastModifiedDate: now,
        })
        .where(eq(userPrefs.userId, userId))
        .run();
    } else {
      await db
        .insert(userPrefs)
        .values({
          userId,
          recentCount: data.prefs.recentCount,
          pageSize: data.prefs.pageSize,
          defaultSort: data.prefs.defaultSort,
          // undefined 时落到 schema 默认值（none/null/70/70）。
          backgroundType: data.prefs.backgroundType,
          backgroundImageUrl: data.prefs.backgroundImageUrl,
          backgroundOpacityLight: data.prefs.backgroundOpacityLight,
          backgroundOpacityDark: data.prefs.backgroundOpacityDark,
          // undefined 时落到 schema 默认值 '[]'。
          musicPlaylist: data.prefs.musicPlaylist
            ? JSON.stringify(data.prefs.musicPlaylist)
            : undefined,
          slogan: data.prefs.slogan,
        })
        .run();
    }
  }

  invalidateTagCache(db, userId);
  invalidateEnginesCache(db, userId);
  invalidatePrefsCache(db, userId);

  return { tagsCreated, bookmarksCreated, bookmarksSkipped };
}
