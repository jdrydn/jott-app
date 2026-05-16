import type { Database } from 'bun:sqlite';
import { VERSION } from '@shared/version';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import type { ClaudeDetection } from './ai/claude';
import type { Db } from './db/client';
import { mountAttachmentsRoutes } from './http/attachments';
import { assets, indexHtml } from './staticAssets.generated';
import { makeCreateContext } from './trpc/context';
import { appRouter } from './trpc/router';

const TRPC_PREFIX = '/api/trpc';

export type AppDeps = {
  db: Db;
  raw: Database;
  dbPath: string;
  attachmentsDir: string;
  claude: ClaudeDetection;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/healthz', (c) => c.json({ ok: true, version: VERSION }));

  const createContext = makeCreateContext({
    db: deps.db,
    raw: deps.raw,
    dbPath: deps.dbPath,
    attachmentsDir: deps.attachmentsDir,
    claude: deps.claude,
  });
  app.all(`${TRPC_PREFIX}/*`, (c) =>
    fetchRequestHandler({
      endpoint: TRPC_PREFIX,
      req: c.req.raw,
      router: appRouter,
      createContext,
    }),
  );

  mountAttachmentsRoutes(app, { db: deps.db, dir: deps.attachmentsDir });

  if (assets.size > 0) mountStatic(app);

  return app;
}

function mountStatic(app: Hono): void {
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.notFound();
    const lookup = c.req.path === '/' ? '/index.html' : c.req.path;
    const filePath = assets.get(lookup);
    if (filePath) return new Response(Bun.file(filePath));
    if (indexHtml) {
      return new Response(Bun.file(indexHtml), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return c.notFound();
  });
}

export type ServerHandle = {
  port: number;
  url: string;
  stop: () => void;
};

export class PortInUseError extends Error {
  constructor(public readonly port: number) {
    super(`port ${port} is already in use — is jottapp already running?`);
    this.name = 'PortInUseError';
  }
}

// Bun.serve defaults to a 10s idleTimeout which trips on multipart uploads
// (e.g. a 10 MB image attachment) over slower browsers/disks. 120s is enough
// headroom while still bounding stuck connections.
const SERVER_IDLE_TIMEOUT_SECONDS = 120;

export function serveApp(opts: { port: number; app: Hono }): ServerHandle {
  try {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: opts.port,
      idleTimeout: SERVER_IDLE_TIMEOUT_SECONDS,
      fetch: opts.app.fetch,
    });
    const port = server.port ?? opts.port;
    return {
      port,
      url: `http://127.0.0.1:${port}`,
      stop: () => {
        server.stop();
      },
    };
  } catch (err) {
    if (isAddressInUse(err)) throw new PortInUseError(opts.port);
    throw err;
  }
}

function isAddressInUse(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  if (code === 'EADDRINUSE') return true;
  const msg = (err as { message?: string }).message ?? '';
  return /address in use|EADDRINUSE/i.test(msg);
}
