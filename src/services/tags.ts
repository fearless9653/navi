import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { tags, bookmarkTags } from '@/db/schema';
import { runWrite } from '@/db/tx';
import { chunk } from '@/db/chunk';
import { assertWithinLimit } from './limits';

export type Tag = typeof tags.$inferSelect;

// 带子标签数量的标签（用于懒加载）
export type TagWithChildren = Tag & { childrenCount: number };

type ParentCacheKey = `${number}:${number | 'root'}`;

const allTagsCache = new WeakMap<DB, Map<number, Tag[]>>();
const tagHierarchyCache = new WeakMap<DB, Map<ParentCacheKey, TagWithChildren[]>>();

function parentCacheKey(userId: number, parentId: number | null): ParentCacheKey {
  return `${userId}:${parentId ?? 'root'}`;
}

function cloneTag(tag: Tag): Tag {
  return { ...tag };
}

function cloneTagWithChildren(tag: TagWithChildren): TagWithChildren {
  return { ...tag };
}

function getCachedAllTags(db: DB, userId: number): Tag[] | null {
  const cached = allTagsCache.get(db)?.get(userId);
  return cached ? cached.map(cloneTag) : null;
}

function setCachedAllTags(db: DB, userId: number, tagList: Tag[]): void {
  let dbCache = allTagsCache.get(db);
  if (!dbCache) {
    dbCache = new Map();
    allTagsCache.set(db, dbCache);
  }
  dbCache.set(userId, tagList.map(cloneTag));
}

function getCachedTagsByParent(
  db: DB,
  userId: number,
  parentId: number | null,
): TagWithChildren[] | null {
  const cached = tagHierarchyCache.get(db)?.get(parentCacheKey(userId, parentId));
  return cached ? cached.map(cloneTagWithChildren) : null;
}

function setCachedTagsByParent(
  db: DB,
  userId: number,
  parentId: number | null,
  tagList: TagWithChildren[],
): void {
  let dbCache = tagHierarchyCache.get(db);
  if (!dbCache) {
    dbCache = new Map();
    tagHierarchyCache.set(db, dbCache);
  }
  dbCache.set(parentCacheKey(userId, parentId), tagList.map(cloneTagWithChildren));
}

export function invalidateTagCache(db: DB, userId: number): void {
  allTagsCache.get(db)?.delete(userId);
  const dbCache = tagHierarchyCache.get(db);
  if (!dbCache) return;
  for (const key of dbCache.keys()) {
    if (key.startsWith(`${userId}:`)) dbCache.delete(key);
  }
}

function assertValidName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('tag_name_empty');
  if (trimmed.includes('/')) throw new Error('tag_name_slash');
}

/** 该用户全部标签（按 path 升序，供前端构树）。 */
export async function listTags(db: DB, userId: number): Promise<Tag[]> {
  const cached = getCachedAllTags(db, userId);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.path))
    .all();
  setCachedAllTags(db, userId, rows);
  return rows.map(cloneTag);
}

/** 按父节点查询标签（懒加载）：parentId=null 返回根标签，parentId=123 返回子标签。 */
export async function listTagsByParent(
  db: DB,
  userId: number,
  parentId: number | null,
): Promise<TagWithChildren[]> {
  const cached = getCachedTagsByParent(db, userId, parentId);
  if (cached) return cached;

  // 查询符合条件的标签
  const tagList = await db
    .select()
    .from(tags)
    .where(
      parentId === null
        ? and(eq(tags.userId, userId), isNull(tags.parentId))
        : and(eq(tags.userId, userId), eq(tags.parentId, parentId)),
    )
    .orderBy(asc(tags.name))
    .all();

  // 一次 GROUP BY 取所有子标签的子节点数，避免每个标签一条 count 查询（N+1）。
  const childIds = tagList.map((t) => t.id);
  const childCounts = new Map<number, number>();
  for (const part of chunk(childIds)) {
    const rows = await db
      .select({ parentId: tags.parentId, c: sql<number>`count(*)` })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.parentId, part)))
      .groupBy(tags.parentId)
      .all();
    for (const r of rows) if (r.parentId != null) childCounts.set(r.parentId, r.c);
  }
  const result: TagWithChildren[] = tagList.map((tag) => ({
    ...tag,
    childrenCount: childCounts.get(tag.id) ?? 0,
  }));

  setCachedTagsByParent(db, userId, parentId, result);
  return result.map(cloneTagWithChildren);
}

export async function getTag(db: DB, userId: number, id: number): Promise<Tag | null> {
  const row = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, userId)))
    .get();
  return row ?? null;
}

export interface CreateTagInput {
  name: string;
  parentId?: number | null;
}

export async function createTag(db: DB, userId: number, input: CreateTagInput): Promise<Tag> {
  await assertWithinLimit(db, userId, 'tags');
  const name = input.name.trim();
  assertValidName(name);

  let parentPath = '';
  if (input.parentId != null) {
    const parent = await getTag(db, userId, input.parentId);
    if (!parent) throw new Error('parent_not_found');
    parentPath = parent.path;
  }
  const path = parentPath ? `${parentPath}/${name}` : name;

  const tag = await db
    .insert(tags)
    .values({ userId, name, parentId: input.parentId ?? null, path })
    .returning()
    .get();
  invalidateTagCache(db, userId);
  return tag;
}

/** 由全量标签构建 parentId → 子 id 列表的映射。 */
function childrenMap(all: Tag[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const t of all) {
    if (t.parentId != null) {
      const arr = m.get(t.parentId);
      if (arr) arr.push(t.id);
      else m.set(t.parentId, [t.id]);
    }
  }
  return m;
}

/** 从 all 中收集 rootId 的子树 id（含自身）；rootId 不存在则返回空。 */
function subtreeIdsFrom(all: Tag[], rootId: number): number[] {
  if (!all.some((t) => t.id === rootId)) return [];
  const kids = childrenMap(all);
  const out: number[] = [];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    out.push(cur);
    const c = kids.get(cur);
    if (c) queue.push(...c);
  }
  return out;
}

/** 某标签的子树 id（含自身）。跨用户/不存在 → []。 */
export async function getTagSubtreeIds(db: DB, userId: number, rootId: number): Promise<number[]> {
  const all = await listTags(db, userId);
  return subtreeIdsFrom(all, rootId);
}

/** 多个标签子树 id 的并集（去重，过滤掉不属本用户的）。 */
export async function expandTagIds(db: DB, userId: number, tagIds: number[]): Promise<number[]> {
  if (tagIds.length === 0) return [];
  const all = await listTags(db, userId);
  const set = new Set<number>();
  for (const id of tagIds) for (const x of subtreeIdsFrom(all, id)) set.add(x);
  return [...set];
}

/**
 * 选中标签中确属本用户的那些的 path（按传入顺序，越权/不存在的略过）。
 * 供列表按 path 前缀过滤子树，避免把整棵子树 id 内联进 SQL 而超 D1 参数上限。
 */
export async function getSelectedTagPaths(
  db: DB,
  userId: number,
  tagIds: number[],
): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const all = await listTags(db, userId);
  const pathById = new Map(all.map((t) => [t.id, t.path]));
  const out: string[] = [];
  for (const id of tagIds) {
    const p = pathById.get(id);
    if (p !== undefined) out.push(p);
  }
  return out;
}

export interface UpdateTagInput {
  name?: string;
  parentId?: number | null;
}

/** 重命名 / 改父级；重算自身及全部后代 path。跨用户/不存在 → 无副作用。 */
export async function updateTag(
  db: DB,
  userId: number,
  id: number,
  input: UpdateTagInput,
): Promise<void> {
  const all = await listTags(db, userId);
  const target = all.find((t) => t.id === id);
  if (!target) return;

  const newName = input.name !== undefined ? input.name.trim() : target.name;
  assertValidName(newName);

  const reparent = 'parentId' in input;
  const newParentId = reparent ? (input.parentId ?? null) : target.parentId;

  // 计算新父 path 并做成环 / 越权校验
  let parentPath = '';
  if (newParentId != null) {
    if (newParentId === id) throw new Error('tag_cycle');
    const subtree = new Set(subtreeIdsFrom(all, id));
    if (subtree.has(newParentId)) throw new Error('tag_cycle');
    const parent = all.find((t) => t.id === newParentId);
    if (!parent) throw new Error('parent_not_found');
    parentPath = parent.path;
  }
  const newPath = parentPath ? `${parentPath}/${newName}` : newName;

  const oldPath = target.path;
  const descendants = all.filter((t) => t.id !== id && t.path.startsWith(`${oldPath}/`));
  const now = new Date();

  await runWrite(db, [
    db
      .update(tags)
      .set({ name: newName, parentId: newParentId, path: newPath, lastModifiedDate: now })
      .where(and(eq(tags.id, id), eq(tags.userId, userId))),
    ...descendants.map((d) =>
      db
        .update(tags)
        .set({ path: newPath + d.path.slice(oldPath.length), lastModifiedDate: now })
        .where(eq(tags.id, d.id)),
    ),
  ]);
  invalidateTagCache(db, userId);
}

/** 级联删除子树及其全部 bookmark_tags 关联。跨用户/不存在 → 无副作用。 */
export async function deleteTag(db: DB, userId: number, id: number): Promise<void> {
  const all = await listTags(db, userId);
  const ids = subtreeIdsFrom(all, id);
  if (ids.length === 0) return;
  // 分片：大子树的 inArray 未分片会超 D1 单查询参数上限（跨片非原子，D1 本就如此）。
  for (const part of chunk(ids)) {
    await runWrite(db, [
      db.delete(bookmarkTags).where(inArray(bookmarkTags.tagId, part)),
      db.delete(tags).where(and(eq(tags.userId, userId), inArray(tags.id, part))),
    ]);
  }
  invalidateTagCache(db, userId);
}

/** 批量删除多个标签（各自级联子树）。 */
export async function bulkDeleteTags(db: DB, userId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  // 一次性取全量标签、合并所有子树 id，再分片批删；避免逐个 deleteTag 反复 listTags + 失效缓存（N+1）。
  const all = await listTags(db, userId);
  const toDelete = new Set<number>();
  for (const id of ids) for (const x of subtreeIdsFrom(all, id)) toDelete.add(x);
  if (toDelete.size === 0) return;
  for (const part of chunk([...toDelete])) {
    await runWrite(db, [
      db.delete(bookmarkTags).where(inArray(bookmarkTags.tagId, part)),
      db.delete(tags).where(and(eq(tags.userId, userId), inArray(tags.id, part))),
    ]);
  }
  invalidateTagCache(db, userId);
}
