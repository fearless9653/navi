import { describe, it, expect } from 'vitest';
import { createTestDb } from '../helpers/testDb';
import { createUser } from '@/services/users';
import {
  listEngines,
  createEngine,
  updateEngine,
  deleteEngine,
  setDefaultEngine,
  reorderEngines,
} from '@/services/engines';
import { importData } from '@/services/transfer';

async function seedUser(db = createTestDb(), email = 'a@x.com') {
  const u = await createUser(db, { email, password: 'password123', displayName: 'U' });
  return { db, userId: u.id };
}

describe('engines service', () => {
  it('建号后默认 3 引擎，首个 isDefault', async () => {
    const { db, userId } = await seedUser();
    const list = await listEngines(db, userId);
    expect(list.map((e) => e.name)).toEqual(['Google', 'Bing', 'DuckDuckGo']);
    expect(list.map((e) => e.iconUrl)).toEqual([
      'https://www.google.com/favicon.ico',
      'https://edgestatic.azureedge.net/shared/cms/lrs1c69a1j/logos/b3bed8dc525c4433afbdd24bb71ea2fc-png-w128.avif',
      'https://duckduckgo.com/static-assets/favicons/favicon.ico',
    ]);
    expect(list[0]!.isDefault).toBe(true);
    expect(list.slice(1).every((e) => !e.isDefault)).toBe(true);
  });

  it('listEngines 缓存同一用户搜索引擎列表读取', async () => {
    const { db, userId } = await seedUser();

    const originalSelect = db.select.bind(db);
    let selectCalls = 0;
    db.select = ((...args: Parameters<typeof db.select>) => {
      selectCalls += 1;
      return originalSelect(...args);
    }) as typeof db.select;

    const first = await listEngines(db, userId);
    const callsAfterFirst = selectCalls;
    const second = await listEngines(db, userId);

    expect(first).toEqual(second);
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(selectCalls).toBe(callsAfterFirst);
  });

  it('引擎写入和导入后失效 listEngines 缓存', async () => {
    const { db, userId } = await seedUser();

    expect((await listEngines(db, userId)).map((e) => e.name)).toEqual([
      'Google',
      'Bing',
      'DuckDuckGo',
    ]);

    await createEngine(db, userId, {
      name: 'Kagi',
      urlTemplate: 'https://kagi.com/search?q={query}',
    });
    expect((await listEngines(db, userId)).map((e) => e.name)).toContain('Kagi');

    await importData(db, userId, {
      mode: 'replace',
      data: {
        engines: [
          {
            name: 'SearXNG',
            urlTemplate: 'https://search.example.com/?q={query}',
            isDefault: true,
          },
        ],
      },
    });
    expect((await listEngines(db, userId)).map((e) => e.name)).toEqual(['SearXNG']);
  });

  it('urlTemplate 缺 {query} 被拒', async () => {
    const { db, userId } = await seedUser();
    await expect(
      createEngine(db, userId, { name: 'X', urlTemplate: 'https://x.com/search' }),
    ).rejects.toThrow();
  });

  it('create isDefault=true 时清掉其他默认', async () => {
    const { db, userId } = await seedUser();
    await createEngine(db, userId, {
      name: 'Kagi',
      urlTemplate: 'https://kagi.com/search?q={query}',
      isDefault: true,
    });
    const list = await listEngines(db, userId);
    const defaults = list.filter((e) => e.isDefault);
    expect(defaults.length).toBe(1);
    expect(defaults[0]!.name).toBe('Kagi');
  });

  it('setDefault 互斥切换', async () => {
    const { db, userId } = await seedUser();
    const list = await listEngines(db, userId);
    const bing = list.find((e) => e.name === 'Bing')!;
    await setDefaultEngine(db, userId, bing.id);
    const after = await listEngines(db, userId);
    expect(after.filter((e) => e.isDefault).map((e) => e.name)).toEqual(['Bing']);
  });

  it('update 改名 / delete 删除', async () => {
    const { db, userId } = await seedUser();
    const list = await listEngines(db, userId);
    const ddg = list.find((e) => e.name === 'DuckDuckGo')!;
    await updateEngine(db, userId, ddg.id, { name: 'DDG' });
    expect((await listEngines(db, userId)).some((e) => e.name === 'DDG')).toBe(true);
    await deleteEngine(db, userId, ddg.id);
    expect((await listEngines(db, userId)).some((e) => e.id === ddg.id)).toBe(false);
  });

  it('reorder 重排后顺序与 sortOrder 归一化', async () => {
    const { db, userId } = await seedUser();
    const [google, bing, ddg] = await listEngines(db, userId);
    // 倒序：DDG, Bing, Google
    await reorderEngines(db, userId, [ddg!.id, bing!.id, google!.id]);
    const after = await listEngines(db, userId);
    expect(after.map((e) => e.name)).toEqual(['DuckDuckGo', 'Bing', 'Google']);
    expect(after.map((e) => e.sortOrder)).toEqual([0, 1, 2]);
  });

  it('reorder 忽略非本人 / 不存在的 id', async () => {
    const db = createTestDb();
    const a = (
      await createUser(db, { email: 'a@x.com', password: 'password123', displayName: 'A' })
    ).id;
    const b = (
      await createUser(db, { email: 'b@x.com', password: 'password123', displayName: 'B' })
    ).id;
    const [ga, ba, da] = await listEngines(db, a);
    const bFirst = (await listEngines(db, b))[0]!;
    // 混入 B 的 id 和一个不存在的 id：应被过滤，仅按 A 自己的 id 重排
    await reorderEngines(db, a, [da!.id, 999999, bFirst.id, ba!.id, ga!.id]);
    const after = await listEngines(db, a);
    expect(after.map((e) => e.name)).toEqual(['DuckDuckGo', 'Bing', 'Google']);
    expect(after.map((e) => e.sortOrder)).toEqual([0, 1, 2]);
    // B 未受影响
    expect((await listEngines(db, b))[0]!.id).toBe(bFirst.id);
  });

  it('reorder 只传部分 id：其余引擎按现序追加，sortOrder 无冲突/空洞', async () => {
    const { db, userId } = await seedUser();
    const [, , ddg] = await listEngines(db, userId); // 初始 Google(0) Bing(1) DDG(2)
    // 只把 DDG 提到最前，其余不传：修复前会造成 sortOrder 冲突（Google/Bing 仍为 0/1）。
    await reorderEngines(db, userId, [ddg!.id]);
    const after = await listEngines(db, userId);
    expect(after.map((e) => e.name)).toEqual(['DuckDuckGo', 'Google', 'Bing']);
    expect(after.map((e) => e.sortOrder)).toEqual([0, 1, 2]);
  });

  it('隔离：A 不能改/删 B 的引擎', async () => {
    const db = createTestDb();
    const a = (
      await createUser(db, { email: 'a@x.com', password: 'password123', displayName: 'A' })
    ).id;
    const b = (
      await createUser(db, { email: 'b@x.com', password: 'password123', displayName: 'B' })
    ).id;
    const bEngine = (await listEngines(db, b))[0]!;
    await updateEngine(db, a, bEngine.id, { name: 'hacked' });
    await deleteEngine(db, a, bEngine.id);
    const bList = await listEngines(db, b);
    expect(bList.some((e) => e.id === bEngine.id && e.name === 'Google')).toBe(true);
  });
});

describe('engines suggestSource', () => {
  it('建号预置引擎的 suggestSource 为空（不因名称推断）', async () => {
    const { db, userId } = await seedUser();
    const list = await listEngines(db, userId);
    expect(list.map((e) => e.suggestSource)).toEqual([null, null, null]);
  });

  it('create 省略或 null 存为 null；google/baidu 可持久化', async () => {
    const { db, userId } = await seedUser();
    const omitted = await createEngine(db, userId, {
      name: 'Kagi',
      urlTemplate: 'https://kagi.com/search?q={query}',
    });
    expect(omitted.suggestSource).toBeNull();

    const none = await createEngine(db, userId, {
      name: 'Startpage',
      urlTemplate: 'https://www.startpage.com/sp/search?query={query}',
      suggestSource: null,
    });
    expect(none.suggestSource).toBeNull();

    const google = await createEngine(db, userId, {
      name: 'G',
      urlTemplate: 'https://www.google.com/search?q={query}',
      suggestSource: 'google',
    });
    expect(google.suggestSource).toBe('google');

    const baidu = await createEngine(db, userId, {
      name: 'B',
      urlTemplate: 'https://www.baidu.com/s?wd={query}',
      suggestSource: 'baidu',
    });
    expect(baidu.suggestSource).toBe('baidu');
  });

  it('create 拒绝非法来源', async () => {
    const { db, userId } = await seedUser();
    await expect(
      createEngine(db, userId, {
        name: 'X',
        urlTemplate: 'https://x.com/search?q={query}',
        suggestSource: 'bing' as unknown as 'google',
      }),
    ).rejects.toThrow('invalid_suggest_source');
  });

  it('update 省略不变，显式 null 清为无', async () => {
    const { db, userId } = await seedUser();
    const engine = await createEngine(db, userId, {
      name: 'Custom',
      urlTemplate: 'https://example.com/search?q={query}',
      suggestSource: 'google',
    });
    await updateEngine(db, userId, engine.id, { name: 'Custom 2' });
    expect((await listEngines(db, userId)).find((e) => e.id === engine.id)?.suggestSource).toBe(
      'google',
    );
    await updateEngine(db, userId, engine.id, { suggestSource: 'baidu' });
    expect((await listEngines(db, userId)).find((e) => e.id === engine.id)?.suggestSource).toBe(
      'baidu',
    );
    await updateEngine(db, userId, engine.id, { suggestSource: null });
    expect((await listEngines(db, userId)).find((e) => e.id === engine.id)?.suggestSource).toBeNull();
  });
});
