import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import serverViteConfig from '../../vite.server.config';
import { existsSync, readFileSync } from 'node:fs';

const root = resolve(import.meta.dirname, '../..');

describe('docker runtime bundling', () => {
  it('将除外部依赖外的 SSR 依赖打进 bundle', () => {
    expect(serverViteConfig.build?.ssr).toBe('src/server/node.ts');
    expect(serverViteConfig.ssr?.noExternal).toBe(true);
    // better-sqlite3：原生模块；undici：含 wasm，仅 node 入口用于 SSRF 的 IP 固定。
    expect(serverViteConfig.build?.rollupOptions?.external).toEqual(['better-sqlite3', 'undici']);
  });

  it('Docker 运行时直接用 node 启动 bundle，而不是依赖 pnpm script', () => {
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('CMD ["node", "dist/server/node.js"]');
  });

  it('后端构建产物旁会带上迁移目录', () => {
    expect(existsSync(resolve(root, 'scripts/copy-migrations.mjs'))).toBe(true);
    expect(readFileSync(resolve(root, 'package.json'), 'utf8')).toContain(
      'node scripts/copy-migrations.mjs',
    );
  });

  it('Docker runtime manifest 恰好安装 bundle 的全部外部依赖，且版本与主 package.json 同步', () => {
    const runtimeManifest = JSON.parse(
      readFileSync(resolve(root, 'docker/package.runtime.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const mainDeps = (
      JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      }
    ).dependencies;
    // bundle 已内联全部 JS 依赖（noExternal: true），runtime 只需装被外部化的依赖（原生模块 / 含 wasm）。
    const external = serverViteConfig.build?.rollupOptions?.external as string[];
    expect(Object.keys(runtimeManifest.dependencies).sort()).toEqual([...external].sort());
    for (const [name, runtimeVersion] of Object.entries(runtimeManifest.dependencies)) {
      // 钉精确版本（无 ^/~），保证镜像构建可复现
      expect(runtimeVersion).toMatch(/^\d/);
      // 与主 package.json 的版本号保持同步（升级依赖时两处一起改）
      expect(mainDeps[name]!.replace(/^[\^~]/, '')).toBe(runtimeVersion);
    }
  });
});
