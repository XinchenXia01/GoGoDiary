import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 纯前端 PWA：无后端、无网络请求。base 使用相对路径，便于部署到任意子目录。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2019',
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
