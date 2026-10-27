import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

function offlineShell() {
  return {
    name: 'floorguard-offline-shell',
    apply: 'build' as const,
    writeBundle(_options: unknown, bundle: Record<string, any>) {
      const assets = Object.values(bundle).filter(item => item.type === 'chunk' && item.isEntry || item.fileName?.endsWith('.css')).map(item => '/' + item.fileName);
      const shell = ['/index.html', '/manifest.webmanifest', '/branding/floorguard-wordmark.svg', '/icons/emblem-transparent.png', '/icons/favicon-v2.png', '/icons/icon-192-v2.png', '/icons/icon-512-v2.png', '/icons/maskable-192-v2.png', '/icons/maskable-512-v2.png', ...assets];
      const hash = createHash('sha256').update(JSON.stringify(assets)).update(fs.readFileSync('public/sw.js'));
      shell.filter(file => !file.startsWith('/assets/')).forEach(file => hash.update(fs.readFileSync('dist' + file)));
      const version = hash.digest('hex').slice(0, 12);
      const worker = fs.readFileSync('public/sw.js', 'utf8').replace('__FG_BUILD_VERSION__', version).replace("/* __FG_SHELL_ASSETS__ */ ['/index.html']", JSON.stringify(shell));
      fs.writeFileSync('dist/sw.js', worker);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), offlineShell()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: ['@mediapipe/tasks-vision', '@vladmandic/face-api'],
  },
});
