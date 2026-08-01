import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// 前端源码在 web/，构建产物输出到 dist/client（由 Node 入口静态托管）。
export default defineConfig({
  root: 'web',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      external: ['react-native-fs', 'fs'],
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
