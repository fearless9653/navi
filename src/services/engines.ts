import { and, asc, eq, ne } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { searchEngines } from '@/db/schema';
import { runWrite, type WriteStatement } from '@/db/tx';
import { assertWithinLimit } from './limits';

export type Engine = typeof searchEngines.$inferSelect;

export const SUGGEST_SOURCES = ['google', 'baidu'] as const;
export type SuggestSource = (typeof SUGGEST_SOURCES)[number];

/** 校验建议来源：缺省 / 空 / null → null（无）；非法值抛 invalid_suggest_source。 */
export function parseSuggestSource(value: unknown): SuggestSource | null {
  if (value === undefined || value === null || value === '') return null;
  if (value === 'google' || value === 'baidu') return value;
  throw new Error('invalid_suggest_source');
}

/** 读库或导入时的宽松解析：仅 google / baidu 有效，其余（含非法值）按无处理。 */
export function asSuggestSource(value: unknown): SuggestSource | null {
  return value === 'google' || value === 'baidu' ? value : null;
}

const enginesCache = new WeakMap<DB, Map<number, Engine[]>>();

function cloneEngine(engine: Engine): Engine {
  return { ...engine };
}

function getCachedEngines(db: DB, userId: number): Engine[] | null {
  const cached = enginesCache.get(db)?.get(userId);
  return cached ? cached.map(cloneEngine) : null;
}

function setCachedEngines(db: DB, userId: number, engines: Engine[]): void {
  let dbCache = enginesCache.get(db);
  if (!dbCache) {
    dbCache = new Map();
    enginesCache.set(db, dbCache);
  }
  dbCache.set(userId, engines.map(cloneEngine));
}

export function invalidateEnginesCache(db: DB, userId: number): void {
  enginesCache.get(db)?.delete(userId);
}

function assertTemplate(urlTemplate: string): void {
  if (!urlTemplate.includes('{query}')) throw new Error('template_missing_query');
}

export async function listEngines(db: DB, userId: number): Promise<Engine[]> {
  const cached = getCachedEngines(db, userId);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(searchEngines)
    .where(eq(searchEngines.userId, userId))
    .orderBy(asc(searchEngines.sortOrder), asc(searchEngines.id))
    .all();
  setCachedEngines(db, userId, rows);
  return rows.map(cloneEngine);
}

export async function getEngine(db: DB, userId: number, id: number): Promise<Engine | null> {
  const row = await db
    .select()
    .from(searchEngines)
    .where(and(eq(searchEngines.id, id), eq(searchEngines.userId, userId)))
    .get();
  return row ?? null;
}

export interface CreateEngineInput {
  name: string;
  urlTemplate: string;
  iconUrl?: string | null;
  sortOrder?: number;
  isDefault?: boolean;
  /** 省略或 null 表示无。 */
  suggestSource?: SuggestSource | null;
}

export async function createEngine(
  db: DB,
  userId: number,
  input: CreateEngineInput,
): Promise<Engine> {
  await assertWithinLimit(db, userId, 'engines');
  assertTemplate(input.urlTemplate);
  const row = await db
    .insert(searchEngines)
    .values({
      userId,
      name: input.name,
      urlTemplate: input.urlTemplate,
      iconUrl: input.iconUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
      isDefault: input.isDefault ?? false,
      suggestSource: parseSuggestSource(input.suggestSource),
    })
    .returning()
    .get();
  if (input.isDefault) {
    // 仅保留这一条为默认
    await runWrite(db, [
      db
        .update(searchEngines)
        .set({ isDefault: false })
        .where(and(eq(searchEngines.userId, userId), ne(searchEngines.id, row.id))),
    ]);
  }
  invalidateEnginesCache(db, userId);
  return row;
}

export interface UpdateEngineInput {
  name?: string;
  urlTemplate?: string;
  iconUrl?: string | null;
  sortOrder?: number;
  isDefault?: boolean;
  /** 省略表示不变；显式 null 清为无。 */
  suggestSource?: SuggestSource | null;
}

/** 更新引擎；设默认时清其他默认。跨用户/不存在 → 无副作用。 */
export async function updateEngine(
  db: DB,
  userId: number,
  id: number,
  input: UpdateEngineInput,
): Promise<void> {
  const owned = await getEngine(db, userId, id);
  if (!owned) return;
  if (input.urlTemplate !== undefined) assertTemplate(input.urlTemplate);

  const patch: Partial<typeof searchEngines.$inferInsert> = { lastModifiedDate: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.urlTemplate !== undefined) patch.urlTemplate = input.urlTemplate;
  if ('iconUrl' in input) patch.iconUrl = input.iconUrl ?? null;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
  if ('suggestSource' in input) patch.suggestSource = parseSuggestSource(input.suggestSource);

  const stmts: WriteStatement[] = [];
  if (input.isDefault === true) {
    stmts.push(
      db.update(searchEngines).set({ isDefault: false }).where(eq(searchEngines.userId, userId)),
    );
  }
  stmts.push(
    db
      .update(searchEngines)
      .set(patch)
      .where(and(eq(searchEngines.id, id), eq(searchEngines.userId, userId))),
  );
  await runWrite(db, stmts);
  invalidateEnginesCache(db, userId);
}

/** 按给定 id 顺序重排该用户的引擎 sortOrder(0..n-1)。非本人/不存在的 id 忽略。 */
export async function reorderEngines(db: DB, userId: number, orderedIds: number[]): Promise<void> {
  const owned = await db
    .select({ id: searchEngines.id })
    .from(searchEngines)
    .where(eq(searchEngines.userId, userId))
    .orderBy(asc(searchEngines.sortOrder), asc(searchEngines.id))
    .all();
  const ownedIds = new Set(owned.map((r) => r.id));
  const requestedSet = new Set<number>();
  const requested: number[] = [];
  for (const id of orderedIds) {
    if (ownedIds.has(id) && !requestedSet.has(id)) {
      requestedSet.add(id);
      requested.push(id);
    }
  }
  // 未在 orderedIds 里的其余 owned 引擎按现序追加，避免只重排部分 id 时产生 sortOrder 冲突/空洞。
  const finalOrder = [
    ...requested,
    ...owned.map((r) => r.id).filter((id) => !requestedSet.has(id)),
  ];
  if (!finalOrder.length) return;

  const now = new Date();
  const stmts: WriteStatement[] = finalOrder.map((id, i) =>
    db
      .update(searchEngines)
      .set({ sortOrder: i, lastModifiedDate: now })
      .where(and(eq(searchEngines.id, id), eq(searchEngines.userId, userId))),
  );
  await runWrite(db, stmts);
  invalidateEnginesCache(db, userId);
}

export async function deleteEngine(db: DB, userId: number, id: number): Promise<void> {
  await db
    .delete(searchEngines)
    .where(and(eq(searchEngines.id, id), eq(searchEngines.userId, userId)))
    .run();
  invalidateEnginesCache(db, userId);
}

/** 把某引擎设为默认（互斥）。跨用户/不存在 → 无副作用。 */
export async function setDefaultEngine(db: DB, userId: number, id: number): Promise<void> {
  const owned = await getEngine(db, userId, id);
  if (!owned) return;
  await runWrite(db, [
    db.update(searchEngines).set({ isDefault: false }).where(eq(searchEngines.userId, userId)),
    db
      .update(searchEngines)
      .set({ isDefault: true, lastModifiedDate: new Date() })
      .where(and(eq(searchEngines.id, id), eq(searchEngines.userId, userId))),
  ]);
  invalidateEnginesCache(db, userId);
}
