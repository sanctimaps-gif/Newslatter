import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const api = process.env.API_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(__dirname, '../shared/src') } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': api, '/r/': api, '/media': api },
  },
  preview: { host: '0.0.0.0', port: 5173, proxy: { '/api': api, '/r/': api, '/media': api } },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900, rollupOptions: { output: { manualChunks: { charts: ['recharts'], editor: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'], react: ['react', 'react-dom', 'react-router-dom'] } } } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], include: ['src/**/*.test.tsx', 'src/**/*.test.ts'] },
} as any);
