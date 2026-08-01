import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolveSecureCookie } from '@/server/config';
import { getMigrationsFolder } from '@/db/migrate';

describe('resolveSecureCookie', () => {
  it('允许通过 SECURE_COOKIES=false 显式关闭 secure cookie', () => {
    expect(resolveSecureCookie({ NODE_ENV: 'production', SECURE_COOKIES: 'false' })).toBe(false);
  });

  it('在未显式配置时，生产环境默认启用 secure cookie', () => {
    expect(resolveSecureCookie({ NODE_ENV: 'production' })).toBe(true);
  });
});

describe('getMigrationsFolder', () => {
  it('返回存在的迁移目录路径', () => {
    const folder = getMigrationsFolder();
    expect(existsSync(folder)).toBe(true);
    expect(folder).toContain('migrations');
    expect(existsSync(`${folder}/meta/_journal.json`)).toBe(true);
  });
});
