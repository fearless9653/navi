import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    // fileURLToPath 而非 URL.pathname：避免 Windows 上 "/D:/..." 前导斜杠破坏别名解析。
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
