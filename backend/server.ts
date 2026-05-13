import { VERSION } from '@shared/version';
import { Hono } from 'hono';

export function createApp(): Hono {
  const app = new Hono();
  app.get('/', (c) => c.text(`jottapp v${VERSION}\n`));
  app.get('/healthz', (c) => c.json({ ok: true, version: VERSION }));
  return app;
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

export function serveApp(opts: { port: number; app: Hono }): ServerHandle {
  try {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: opts.port,
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
