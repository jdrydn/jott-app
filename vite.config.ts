import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const projectRoot = process.cwd();
const FRONTEND_PORT = 4853;
const BACKEND_DEV_PORT = 4854;

export default defineConfig({
  root: 'frontend',
  resolve: {
    alias: {
      '@backend': resolve(projectRoot, 'backend'),
      '@frontend': resolve(projectRoot, 'frontend'),
      '@shared': resolve(projectRoot, 'shared'),
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: FRONTEND_PORT,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${BACKEND_DEV_PORT}`,
    },
  },
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
  },
});
