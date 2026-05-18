import type { Subprocess } from 'bun';

const DEV_DATA_DIR = process.env.JOTT_DATA_DIR ?? `${process.cwd()}/.jott-dev`;
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

const forwarded = process.argv.slice(2);
const backend = launch([
  'bun',
  '--watch',
  'backend/index.ts',
  '--port',
  BACKEND_DEV_PORT,
  '--data-dir',
  DEV_DATA_DIR,
  ...forwarded,
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
