import type { Subprocess } from 'bun';

const DEV_DB = process.env.JOTTAPP_DB ?? `${process.cwd()}/jottapp-dev.db`;
const BACKEND_DEV_PORT = '4854';

const procs: Subprocess[] = [];

function launch(cmd: string[]): Subprocess {
  const p = Bun.spawn(cmd, {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  procs.push(p);
  return p;
}

const backend = launch([
  'bun',
  '--watch',
  'backend/index.ts',
  '--port',
  BACKEND_DEV_PORT,
  '--db',
  DEV_DB,
  '--no-open',
]);
const frontend = launch(['bun', '--bun', 'vite']);

let shuttingDown = false;
function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    try {
      p.kill('SIGTERM');
    } catch {
      // ignore — process may already be dead
    }
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

await Promise.race([backend.exited, frontend.exited]);
shutdown(1);
