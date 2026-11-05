import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacyFlexGap from './postcss-legacy-flex-gap.js';

export default defineConfig({
  plugins: [react()],
  build: {
    // 精网桌面客户端内嵌的是 Chromium 73（Chrome 74 之前），
    // 不支持可选链 ?. / 空值合并 ?? 等 ES2020 语法；esbuild 会把它们降级为等价写法。
    target: 'chrome73',
    cssTarget: 'chrome73',
  },
  css: {
    postcss: { plugins: [legacyFlexGap()] },
  },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://localhost:3001' },
  },
});
