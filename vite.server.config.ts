import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // 与 tsconfig paths、vitest 配置保持一致，使 node 打包也能解析 @/ 别名。
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: 'src/server/node.ts',
    outDir: 'dist/server',
    emptyOutDir: false,
    target: 'node22',
    rollupOptions: {
      // better-sqlite3：原生模块，不可打包。
      // undici：仅 node 入口用于 SSRF 的 IP 固定；含 wasm（llhttp），外部化避免 Rollup 打包破坏运行时，
      // 运行时镜像由 docker/package.runtime.json 用 npm 装（精确版本单独维护）。
      external: ['better-sqlite3', 'undici'],
      output: {
        entryFileNames: 'node.js',
      },
    },
  },
});
