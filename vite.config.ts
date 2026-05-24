import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import devServer from '@hono/vite-dev-server';
import bunAdapter from '@hono/vite-dev-server/bun';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Bun's `import x from './foo.sql' with { type: 'text' }` works in prod (Bun
// loader), but Vite's SSR transform parses the .sql file as JS. Intercept
// .sql ids during dev and return their contents as a string default export.
function sqlTextPlugin(): Plugin {
  return {
    name: 'custom:sql-text-loader',
    enforce: 'pre',
    load(id) {
      const clean = id.split('?').shift()!;
      if (!clean.endsWith('.sql')) return null;
      const text = readFileSync(clean, 'utf8');
      return `export default ${JSON.stringify(text)};`;
    },
  };
}

const projectRoot = process.cwd();
const FRONTEND_PORT = 4853;

export default defineConfig({
  root: 'frontend',
  publicDir: resolve(projectRoot, 'public'),
  resolve: {
    alias: {
      '@backend': resolve(projectRoot, 'backend'),
      '@frontend': resolve(projectRoot, 'frontend'),
      '@shared': resolve(projectRoot, 'shared'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    sqlTextPlugin(),
    devServer({
      entry: resolve(projectRoot, 'backend/dev-vite.ts'),
      adapter: bunAdapter,
      exclude: [/^(?!\/api\/|\/healthz$).*/],
    }),
  ],
  server: {
    port: FRONTEND_PORT,
    strictPort: true,
  },
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
  },
});
