import { describe, it, expect } from 'vitest';
import { createTestDb } from '../helpers/testDb';
import { createUser } from '@/services/users';
import { createTag } from '@/services/tags';
import { createBookmark } from '@/services/bookmarks';
import { updatePrefs } from '@/services/prefs';
import { exportData } from '@/services/transfer';

async function seedA(db = createTestDb()) {
  const a = (await createUser(db, { email: 'a@x.com', password: 'password123', displayName: 'A' }))
    .id;
  const tech = await createTag(db, a, { name: '技术' });
  const py = await createTag(db, a, { name: 'python', parentId: tech.id });
  await createBookmark(db, a, {
    url: 'https://dj.com',
    name: 'Django',
    description: 'web',
    weight: 7,
    tagIds: [py.id],
  });
  await updatePrefs(db, a, {
    pageSize: 40,
    backgroundType: 'custom',
    backgroundImageUrl: 'https://img.example/bg.jpg',
    backgroundOpacityLight: 70,
    backgroundOpacityDark: 50,
    musicPlaylist: [{ url: 'https://oss.example/song.mp3', name: '晴天' }],
    slogan: '把时间留给热爱的事。',
  });
  return { db, a };
}

describe('exportData', () => {
  it('导出含 tags(path) / bookmarks(tagPaths) / engines / prefs', async () => {
    const { db, a } = await seedA();
    const out = await exportData(db, a, new Date(0));
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(out.tags.map((t) => t.path).sort()).toEqual(['技术', '技术/python']);
    expect(out.bookmarks.length).toBe(1);
    expect(out.bookmarks[0]!.url).toBe('https://dj.com');
    expect(out.bookmarks[0]!.isActive).toBe(true);
    expect(out.bookmarks[0]!.tagPaths).toEqual(['技术/python']);
    expect(out.engines.map((e) => e.name)).toEqual(['Google', 'Bing', 'DuckDuckGo']);
    expect(out.prefs.pageSize).toBe(40);
    expect(out.prefs.backgroundType).toBe('custom');
    expect(out.prefs.backgroundImageUrl).toBe('https://img.example/bg.jpg');
    expect(out.prefs.backgroundOpacityLight).toBe(70);
    expect(out.prefs.backgroundOpacityDark).toBe(50);
    expect(out.prefs.musicPlaylist).toEqual([
      { url: 'https://oss.example/song.mp3', name: '晴天' },
    ]);
    expect(out.prefs.slogan).toBe('把时间留给热爱的事。');
  });

  it('导出保留弃用状态', async () => {
    const db = createTestDb();
    const a = (
      await createUser(db, { email: 'a@x.com', password: 'password123', displayName: 'A' })
    ).id;
    await createBookmark(db, a, {
      url: 'https://inactive.example',
      name: 'Inactive',
      isActive: false,
    });

    const out = await exportData(db, a, new Date(0));

    expect(out.bookmarks).toMatchObject([{ url: 'https://inactive.example', isActive: false }]);
  });

  it('隔离：导出不含他人数据', async () => {
    const { db, a } = await seedA();
    const b = (
      await createUser(db, { email: 'b@x.com', password: 'password123', displayName: 'B' })
    ).id;
    await createBookmark(db, b, { url: 'https://b-secret.com', name: 'B-secret' });
    const out = await exportData(db, a, new Date(0));
    expect(out.bookmarks.some((x) => x.url.includes('b-secret'))).toBe(false);
  });
});
