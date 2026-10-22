import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  server: {
    proxy: { '/api': process.env.ARESPATH_API_TARGET || 'http://127.0.0.1:8001' },
  },
  preview: {
    proxy: { '/api': process.env.ARESPATH_API_TARGET || 'http://127.0.0.1:8001' },
  },
  build: {
    rolldownOptions: {
      input: {
        globe: fileURLToPath(new URL('./index.html', import.meta.url)),
        tiles: fileURLToPath(new URL('./tiles.html', import.meta.url)),
      },
    },
  },
});
