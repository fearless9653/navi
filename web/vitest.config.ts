import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// 前端组件测试：jsdom 环境 + @ 指向 web/src（与后端 vitest.config.ts 隔离）。
export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls: false } })],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
