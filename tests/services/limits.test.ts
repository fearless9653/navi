import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/testDb';
import type { NodeDB } from '@/db/client';
import { users, searchEngines } from '@/db/schema';
import {
  LIMITS,
  LimitExceededError,
  countResource,
  assertWithinLimit,
  assertCountWithinLimit,
} from '@/services/limits';
import { createEngine } from '@/services/engines';
import { importData } from '@/services/transfer';

function seedUser(db: NodeDB, email: string): number {
  db.insert(users).values({ email, passwordHash: 'x', displayName: 'U' }).run();
  return db.select().from(users).where(eq(users.email, email)).get()!.id;
}

/** 直接插库把某用户的引擎数灌到 n 条（绕过 createEngine 的上限检查）。 */
function fillEngines(db: NodeDB, userId: number, n: number): void {
  for (let i = 0; i < n; i++) {
    db.insert(searchEngines)
      .values({ userId, name: `E${i}`, urlTemplate: `https://e${i}.com/?q={query}` })
      .run();
  }
}

describe('limits service', () => {
  it('assertCountWithinLimit：等于上限放行、超过抛错', () => {
    expect(() => assertCountWithinLimit('engines', LIMITS.engines)).not.toThrow();
    expect(() => assertCountWithinLimit('engines', LIMITS.engines + 1)).toThrow(LimitExceededError);
  });

  it('LimitExceededError 携带 resource 与 limit', () => {
    try {
      assertCountWithinLimit('tags', LIMITS.tags + 1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LimitExceededError);
      expect((e as LimitExceededError).resource).toBe('tags');
      expect((e as LimitExceededError).limit).toBe(LIMITS.tags);
    }
  });

  it('countResource 统计某用户某资源行数', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    fillEngines(db, u, 3);
    expect(await countResource(db, u, 'engines')).toBe(3);
  });

  it('assertWithinLimit：达到上限后再增即抛错', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    fillEngines(db, u, LIMITS.engines - 1);
    await expect(assertWithinLimit(db, u, 'engines')).resolves.toBeUndefined();
    fillEngines(db, u, 1); // 恰好到上限
    await expect(assertWithinLimit(db, u, 'engines')).rejects.toThrow(LimitExceededError);
  });

  it('createEngine 触达上限被拒', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    fillEngines(db, u, LIMITS.engines);
    await expect(
      createEngine(db, u, { name: 'X', urlTemplate: 'https://x.com/?q={query}' }),
    ).rejects.toThrow(LimitExceededError);
  });

  it('限额按用户隔离：A 满额不影响 B', async () => {
    const db = createTestDb();
    const a = seedUser(db, 'a@x.com');
    const b = seedUser(db, 'b@x.com');
    fillEngines(db, a, LIMITS.engines);
    await expect(
      createEngine(db, b, { name: 'ok', urlTemplate: 'https://ok.com/?q={query}' }),
    ).resolves.toBeDefined();
  });

  it('导入预检：merge 超出上限则整批不写、抛 LimitExceededError', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    fillEngines(db, u, LIMITS.engines);
    const engines = [{ name: 'extra', urlTemplate: 'https://extra.com/?q={query}' }];
    await expect(importData(db, u, { mode: 'merge', data: { engines } })).rejects.toThrow(
      LimitExceededError,
    );
    // 预检失败：不应有任何写入（引擎数仍为上限值）。
    expect(await countResource(db, u, 'engines')).toBe(LIMITS.engines);
  });

  it('导入预检：replace 按导入内容数量判定', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    const tooMany = Array.from({ length: LIMITS.engines + 1 }, (_, i) => ({
      name: `E${i}`,
      urlTemplate: `https://e${i}.com/?q={query}`,
    }));
    await expect(
      importData(db, u, { mode: 'replace', data: { engines: tooMany } }),
    ).rejects.toThrow(LimitExceededError);
  });

  it('导入预检：merge 去重后净增量不超限则放行', async () => {
    const db = createTestDb();
    const u = seedUser(db, 'a@x.com');
    fillEngines(db, u, LIMITS.engines - 1);
    // 新增 1 条恰好到上限 → 放行。
    await expect(
      importData(db, u, {
        mode: 'merge',
        data: { engines: [{ name: 'last', urlTemplate: 'https://last.com/?q={query}' }] },
      }),
    ).resolves.toBeDefined();
    expect(await countResource(db, u, 'engines')).toBe(LIMITS.engines);
  });
});
