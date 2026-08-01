import { and, asc, desc, eq, gt, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { bookmarks, bookmarkTags, tags } from '@/db/schema';
import { runWrite, type WriteStatement } from '@/db/tx';
import { chunk, MAX_SQL_PARAMS } from '@/db/chunk';
import type { Tag } from './tags';
import { getSelectedTagPaths } from './tags';
import { likePattern } from './likeEscape';
import { assertWithinLimit } from './limits';

export type Bookmark = typeof bookmarks.$inferSelect;
export type BookmarkWithTags = Bookmark & { tags: Tag[] };
export const DEFAULT_BOOKMARK_WEIGHT = 100;

/** 把 tagIds 收窄为确属本用户的标签 id。 */
async function filterUserTagIds(db: DB, userId: number, tagIds: number[]): Promise<number[]> {
  if (tagIds.length === 0) return [];
  const out: number[] = [];
  // 分片：inArray 每个 id 占一个绑定参数，未分片会超 D1 单查询上限。
  for (const part of chunk(tagIds)) {
    const rows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, part)))
      .all();
    for (const r of rows) out.push(r.id);
  }
  return out;
}

/** 批量取每个书签的标签（按 path 升序），避免 N+1。 */
export async function loadTagsByBookmark(
  db: DB,
  bookmarkIds: number[],
): Promise<Map<number, Tag[]>> {
  const m = new Map<number, Tag[]>();
  for (const id of bookmarkIds) m.set(id, []);
  if (bookmarkIds.length === 0) return m;
  // 分片：每个书签 id 只落在一个分片里，故按 path 的组内有序性得以保留。
  for (const part of chunk(bookmarkIds)) {
    const rows = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId, tag: tags })
      .from(bookmarkTags)
      .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
      .where(inArray(bookmarkTags.bookmarkId, part))
      .orderBy(asc(tags.path))
      .all();
    for (const r of rows) m.get(r.bookmarkId)?.push(r.tag);
  }
  return m;
}

/**
 * 批量加载书签 → tagId 列表（精简版，不 join tags 表）。
 * 仅查 bookmark_tags，供首页列表用前端全量标签映射自行组装。
 */
export async function loadTagIdsByBookmark(
  db: DB,
  bookmarkIds: number[],
): Promise<Map<number, number[]>> {
  const m = new Map<number, number[]>();
  for (const id of bookmarkIds) m.set(id, []);
  if (bookmarkIds.length === 0) return m;
  for (const part of chunk(bookmarkIds)) {
    const rows = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId, tagId: bookmarkTags.tagId })
      .from(bookmarkTags)
      .where(inArray(bookmarkTags.bookmarkId, part))
      .all();
    for (const r of rows) m.get(r.bookmarkId)?.push(r.tagId);
  }
  return m;
}

export interface CreateBookmarkInput {
  url: string;
  name: string;
  description?: string | null;
  faviconUrl?: string | null;
  weight?: number;
  isActive?: boolean;
  tagIds?: number[];
}

export async function createBookmark(
  db: DB,
  userId: number,
  input: CreateBookmarkInput,
): Promise<Bookmark> {
  await assertWithinLimit(db, userId, 'bookmarks');
  const validTagIds = await filterUserTagIds(db, userId, input.tagIds ?? []);
  const bm = await db
    .insert(bookmarks)
    .values({
      userId,
      url: input.url,
      name: input.name,
      description: input.description ?? null,
      faviconUrl: input.faviconUrl ?? null,
      weight: input.weight ?? DEFAULT_BOOKMARK_WEIGHT,
      isActive: input.isActive ?? true,
    })
    .returning()
    .get();
  if (validTagIds.length > 0) {
    await runWrite(
      db,
      validTagIds.map((tagId) => db.insert(bookmarkTags).values({ bookmarkId: bm.id, tagId })),
    );
  }
  return bm;
}

export async function getBookmark(
  db: DB,
  userId: number,
  id: number,
): Promise<BookmarkWithTags | null> {
  const row = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .get();
  if (!row) return null;
  const tagMap = await loadTagsByBookmark(db, [row.id]);
  return { ...row, tags: tagMap.get(row.id) ?? [] };
}

export interface UpdateBookmarkInput {
  url?: string;
  name?: string;
  description?: string | null;
  faviconUrl?: string | null;
  weight?: number;
  isActive?: boolean;
  tagIds?: number[];
}

/** 更新字段；若传 tagIds 则整体替换关联。跨用户/不存在 → 无副作用。 */
export async function updateBookmark(
  db: DB,
  userId: number,
  id: number,
  input: UpdateBookmarkInput,
): Promise<void> {
  const owned = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .get();
  if (!owned) return;

  const patch: Partial<typeof bookmarks.$inferInsert> = { lastModifiedDate: new Date() };
  if (input.url !== undefined) patch.url = input.url;
  if (input.name !== undefined) patch.name = input.name;
  if ('description' in input) patch.description = input.description ?? null;
  if ('faviconUrl' in input) patch.faviconUrl = input.faviconUrl ?? null;
  if (input.weight !== undefined) patch.weight = input.weight;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const replaceTags = input.tagIds !== undefined;
  const validTagIds = replaceTags ? await filterUserTagIds(db, userId, input.tagIds!) : [];

  const stmts: WriteStatement[] = [
    db
      .update(bookmarks)
      .set(patch)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId))),
  ];
  if (replaceTags) {
    stmts.push(db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id)));
    for (const tagId of validTagIds) {
      stmts.push(db.insert(bookmarkTags).values({ bookmarkId: id, tagId }));
    }
  }
  await runWrite(db, stmts);
}

/** 删除书签及其关联。跨用户/不存在 → 无副作用。 */
export async function deleteBookmark(db: DB, userId: number, id: number): Promise<void> {
  const owned = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .get();
  if (!owned) return;
  await runWrite(db, [
    db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id)),
    db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId))),
  ]);
}

export type SortKey = 'weight' | 'name' | 'recent' | 'created' | 'updated' | 'visits';
export type SortDir = 'asc' | 'desc';
export type BookmarkStatus = 'active' | 'inactive' | 'all';

export interface ListBookmarksOptions {
  /** 选中标签：交集 + 父含子（每个标签展开为其子树）。 */
  tagIds?: number[];
  /** 模糊关键字，在已按标签收窄的范围内匹配 name/description/url 子串。 */
  query?: string;
  sort?: SortKey;
  dir?: SortDir;
  status?: BookmarkStatus;
  page?: number;
  pageSize?: number;
  /**
   * 是否返回完整标签对象。默认 true（现状：items 为 BookmarkWithTags[]）。
   * false 时走精简分支：items 为 BookmarkListItem[]（仅 tagIds，不 join tags 表）。
   */
  detail?: boolean;
}

export interface ListBookmarksResult {
  items: BookmarkWithTags[];
  total: number;
  page: number;
  pageSize: number;
}

/** 精简列表项：书签标量全字段 + 仅 tagIds（不含标签 name/path 等）。 */
export type BookmarkListItem = Bookmark & { tagIds: number[] };

export interface ListBookmarksResultLite {
  items: BookmarkListItem[];
  total: number;
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 24;

/**
 * 一个相关 EXISTS：书签需命中「以 selfPath 为根的标签子树」中任一标签。
 * 用 path 前缀（自身精确 + 子孙 `selfPath/...`）判定，绑定参数固定 ~4 个、与子树大小无关，
 * 避免把整棵子树 id 内联进 `in (...)` 而超 D1 单查询参数上限。
 * 用 substr + length(绑定串) 做「大小写敏感、按字符」的前缀比较（LIKE 对 ASCII 大小写不敏感，会误伤仅大小写不同的同级子树）。
 */
function tagSubtreeExists(userId: number, selfPath: string) {
  const prefix = `${selfPath}/`;
  return sql`exists (select 1 from ${bookmarkTags} bt join ${tags} t on bt.tag_id = t.id where bt.bookmark_id = ${bookmarks.id} and t.user_id = ${userId} and (t.path = ${selfPath} or substr(t.path, 1, length(${prefix})) = ${prefix}))`;
}

function orderFor(sort: SortKey, dir: SortDir = 'desc') {
  const isAsc = dir === 'asc';
  switch (sort) {
    case 'name':
      return [isAsc ? asc(bookmarks.name) : desc(bookmarks.name)];
    case 'recent':
      // lastVisitedAt 倒序，NULL 排最后
      return isAsc
        ? [sql`${bookmarks.lastVisitedAt} is null`, asc(bookmarks.lastVisitedAt)]
        : [sql`${bookmarks.lastVisitedAt} is null`, desc(bookmarks.lastVisitedAt)];
    case 'created':
      return isAsc
        ? [asc(bookmarks.createdDate), asc(bookmarks.id)]
        : [desc(bookmarks.createdDate), desc(bookmarks.id)];
    case 'updated':
      return isAsc
        ? [asc(bookmarks.lastModifiedDate), asc(bookmarks.id)]
        : [desc(bookmarks.lastModifiedDate), desc(bookmarks.id)];
    case 'visits':
      return isAsc
        ? [asc(bookmarks.visitCount), asc(bookmarks.name)]
        : [desc(bookmarks.visitCount), asc(bookmarks.name)];
    case 'weight':
    default:
      return isAsc
        ? [asc(bookmarks.weight), asc(bookmarks.name)]
        : [desc(bookmarks.weight), asc(bookmarks.name)];
  }
}

/** 列表查询：父含子 + 多选交集 + 模糊 + 排序 + 分页。 */
export function listBookmarks(
  db: DB,
  userId: number,
  opts?: ListBookmarksOptions & { detail?: true },
): Promise<ListBookmarksResult>;
export function listBookmarks(
  db: DB,
  userId: number,
  opts: ListBookmarksOptions & { detail: false },
): Promise<ListBookmarksResultLite>;
export async function listBookmarks(
  db: DB,
  userId: number,
  opts: ListBookmarksOptions = {},
): Promise<ListBookmarksResult | ListBookmarksResultLite> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  const conds = [eq(bookmarks.userId, userId)];
  const status = opts.status ?? 'active';
  if (status === 'active') conds.push(eq(bookmarks.isActive, true));
  else if (status === 'inactive') conds.push(eq(bookmarks.isActive, false));

  if (opts.tagIds && opts.tagIds.length > 0) {
    // 每个选中标签取其 path，各自展开为「父含子」的子树条件并 AND（多选取交集）。
    // 无效/越权标签不产生 path → 无条件（保留「全为无效标签则返回全部」的既有语义）。
    const paths = await getSelectedTagPaths(db, userId, opts.tagIds);
    for (const p of paths) conds.push(tagSubtreeExists(userId, p));
  }

  const q = opts.query?.trim();
  if (q) {
    const p = likePattern(q);
    conds.push(
      or(
        sql`lower(${bookmarks.name}) like ${p} escape '\\'`,
        sql`lower(coalesce(${bookmarks.description}, '')) like ${p} escape '\\'`,
        sql`lower(${bookmarks.url}) like ${p} escape '\\'`,
      )!,
    );
  }

  const where = and(...conds);

  const totalRow = await db
    .select({ c: sql<number>`count(*)` })
    .from(bookmarks)
    .where(where)
    .get();
  const total = totalRow?.c ?? 0;

  const rows = await db
    .select()
    .from(bookmarks)
    .where(where)
    .orderBy(...orderFor(opts.sort ?? 'weight', opts.dir ?? 'desc'))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const ids = rows.map((r) => r.id);

  // 精简模式：只取 tagIds，不 join tags 整行（前端用全量标签映射自行组装）。
  if (opts.detail === false) {
    const idMap = await loadTagIdsByBookmark(db, ids);
    const items: BookmarkListItem[] = rows.map((r) => ({ ...r, tagIds: idMap.get(r.id) ?? [] }));
    return { items, total, page, pageSize };
  }

  const tagMap = await loadTagsByBookmark(db, ids);
  const items: BookmarkWithTags[] = rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));

  return { items, total, page, pageSize };
}

/** 登记一次访问：lastVisitedAt=now、visitCount+1。跨用户/不存在 → 无副作用。 */
export async function recordVisit(
  db: DB,
  userId: number,
  id: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(bookmarks)
    .set({
      lastVisitedAt: now,
      visitCount: sql`${bookmarks.visitCount} + 1`,
      // 刻意不改 lastModifiedDate：访问不是内容编辑，否则会污染「最近修改」排序（与 clearRecent 一致）。
    })
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId), eq(bookmarks.isActive, true)))
    .run();
}

/** 最近访问的精简字段：仅前端列表渲染所需。 */
export type RecentBookmark = Pick<Bookmark, 'id' | 'url' | 'name' | 'faviconUrl'>;

/**
 * 最近访问：lastVisitedAt 非空、倒序、限 limit。
 * 默认只返回精简字段（RecentBookmark），detail=true 时返回全字段并带标签。
 */
export function listRecent(db: DB, userId: number, limit: number): Promise<RecentBookmark[]>;
export function listRecent(
  db: DB,
  userId: number,
  limit: number,
  detail: true,
): Promise<BookmarkWithTags[]>;
export async function listRecent(
  db: DB,
  userId: number,
  limit: number,
  detail = false,
): Promise<RecentBookmark[] | BookmarkWithTags[]> {
  const where = and(
    eq(bookmarks.userId, userId),
    eq(bookmarks.isActive, true),
    isNotNull(bookmarks.lastVisitedAt),
  );
  const cap = Math.max(0, Math.floor(limit));

  if (!detail) {
    return db
      .select({
        id: bookmarks.id,
        url: bookmarks.url,
        name: bookmarks.name,
        faviconUrl: bookmarks.faviconUrl,
      })
      .from(bookmarks)
      .where(where)
      .orderBy(desc(bookmarks.lastVisitedAt))
      .limit(cap)
      .all();
  }

  const rows = await db
    .select()
    .from(bookmarks)
    .where(where)
    .orderBy(desc(bookmarks.lastVisitedAt))
    .limit(cap)
    .all();
  const tagMap = await loadTagsByBookmark(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

/** 首页三榜单（访问次数 / 自设权重 / 创建时间）的精简结果。 */
export interface TopLists {
  visits: RecentBookmark[];
  weight: RecentBookmark[];
  created: RecentBookmark[];
}

/**
 * 首页三榜单，一次查询三份精简列表（各 ≤ limit 条，仅 isActive）：
 * - visits：visitCount > 0，按 visitCount desc, name asc（与 orderFor 的 visits 一致）；
 * - weight：weight ≠ 0（0 表示不参与榜单；负值沉底），按 weight desc, name asc；
 * - created：不过滤，按 createdDate desc, id desc（与 orderFor 的 created 一致）。
 * 只读榜单，不提供清空/单删（与「最近访问」不同——那是刻意的产品决策）。
 */
export async function listTops(db: DB, userId: number, limit: number): Promise<TopLists> {
  const cap = Math.max(0, Math.floor(limit));
  const slim = {
    id: bookmarks.id,
    url: bookmarks.url,
    name: bookmarks.name,
    faviconUrl: bookmarks.faviconUrl,
  };
  const base = and(eq(bookmarks.userId, userId), eq(bookmarks.isActive, true));

  const visits = await db
    .select(slim)
    .from(bookmarks)
    .where(and(base, gt(bookmarks.visitCount, 0)))
    .orderBy(desc(bookmarks.visitCount), asc(bookmarks.name))
    .limit(cap)
    .all();
  const weight = await db
    .select(slim)
    .from(bookmarks)
    .where(and(base, ne(bookmarks.weight, 0)))
    .orderBy(desc(bookmarks.weight), asc(bookmarks.name))
    .limit(cap)
    .all();
  const created = await db
    .select(slim)
    .from(bookmarks)
    .where(base)
    .orderBy(desc(bookmarks.createdDate), desc(bookmarks.id))
    .limit(cap)
    .all();

  return { visits, weight, created };
}

/** 清空"最近访问"轨：该用户所有书签 lastVisitedAt 置空（不删书签、不动 weight）。 */
export async function clearRecent(db: DB, userId: number): Promise<void> {
  await db.update(bookmarks).set({ lastVisitedAt: null }).where(eq(bookmarks.userId, userId)).run();
}

/** 从"最近访问"移除单条：该书签 lastVisitedAt 置空（不删书签、不动 weight/visitCount）。 */
export async function clearRecentOne(db: DB, userId: number, id: number): Promise<void> {
  await db
    .update(bookmarks)
    .set({ lastVisitedAt: null })
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .run();
}

/** 该用户拥有的书签 id 子集。 */
async function ownedBookmarkIds(db: DB, userId: number, ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const out: number[] = [];
  for (const part of chunk(ids)) {
    const rows = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, part)))
      .all();
    for (const r of rows) out.push(r.id);
  }
  return out;
}

/** 批量删除（仅属本用户的），含关联；返回实际删除数。 */
export async function bulkDeleteBookmarks(db: DB, userId: number, ids: number[]): Promise<number> {
  const owned = await ownedBookmarkIds(db, userId, ids);
  if (owned.length === 0) return 0;
  // 分片：每片一次原子写（跨片非原子——D1 本就无法跨语句交互式事务，已记录在案）。
  for (const part of chunk(owned)) {
    await runWrite(db, [
      db.delete(bookmarkTags).where(inArray(bookmarkTags.bookmarkId, part)),
      db.delete(bookmarks).where(inArray(bookmarks.id, part)),
    ]);
  }
  return owned.length;
}

/** 批量给一批书签打一批标签（笛卡尔积），幂等（已存在则跳过）。 */
export async function bulkAssignTags(
  db: DB,
  userId: number,
  bookmarkIds: number[],
  tagIds: number[],
): Promise<void> {
  const owned = await ownedBookmarkIds(db, userId, bookmarkIds);
  const validTags = await filterUserTagIds(db, userId, tagIds);
  if (owned.length === 0 || validTags.length === 0) return;
  const rows = owned.flatMap((bid) => validTags.map((tid) => ({ bookmarkId: bid, tagId: tid })));
  // 每行 2 个绑定参数，按 (上限/2) 行/片切，保证单条 insert 不超参数上限。
  for (const part of chunk(rows, Math.floor(MAX_SQL_PARAMS / 2))) {
    await runWrite(db, [db.insert(bookmarkTags).values(part).onConflictDoNothing()]);
  }
}

/** 批量移除一批书签上的一批标签关联。 */
export async function bulkRemoveTags(
  db: DB,
  userId: number,
  bookmarkIds: number[],
  tagIds: number[],
): Promise<void> {
  const owned = await ownedBookmarkIds(db, userId, bookmarkIds);
  const validTags = await filterUserTagIds(db, userId, tagIds);
  if (owned.length === 0 || validTags.length === 0) return;
  // 单条 delete 的参数 = owned 片 + validTags 片，两者都切分以保证总数不超上限。
  const half = Math.floor(MAX_SQL_PARAMS / 2);
  for (const ownedPart of chunk(owned, half)) {
    for (const tagPart of chunk(validTags, half)) {
      await db
        .delete(bookmarkTags)
        .where(
          and(inArray(bookmarkTags.bookmarkId, ownedPart), inArray(bookmarkTags.tagId, tagPart)),
        )
        .run();
    }
  }
}
