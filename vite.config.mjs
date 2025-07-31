import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/status': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true
      },
      '/stream.m3u8': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '^/stream.*\\.ts$': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  }
});