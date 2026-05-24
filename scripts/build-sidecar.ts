// Builds the Bun backend sidecar for the *host* runner and writes it to
// tauri/binaries/jottapp-backend-<TRIPLE>. Used as Tauri's beforeBuildCommand,
// so each CI runner produces the sidecar matching its own arch/OS — no
// cross-compile from a single runner.

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

type HostMap = { bunTarget: string; triple: string };

const HOSTS: Record<string, HostMap> = {
  'darwin-arm64': { bunTarget: 'bun-darwin-arm64', triple: 'aarch64-apple-darwin' },
  'darwin-x64': { bunTarget: 'bun-darwin-x64', triple: 'x86_64-apple-darwin' },
  'linux-x64': { bunTarget: 'bun-linux-x64', triple: 'x86_64-unknown-linux-gnu' },
  'linux-arm64': { bunTarget: 'bun-linux-arm64', triple: 'aarch64-unknown-linux-gnu' },
  'win32-x64': { bunTarget: 'bun-windows-x64', triple: 'x86_64-pc-windows-msvc' },
};

const key = `${process.platform}-${process.arch}`;
const host = HOSTS[key];
if (!host) {
  process.stderr.write(`unsupported host ${key} — known: ${Object.keys(HOSTS).join(', ')}\n`);
  process.exit(1);
}

const outfile = resolve(process.cwd(), `tauri/binaries/jottapp-backend-${host.triple}`);
process.stdout.write(`▸ sidecar: ${host.bunTarget} → ${outfile}\n`);

const r = spawnSync(
  'bun',
  ['scripts/build.ts', `--target=${host.bunTarget}`, `--outfile=${outfile}`],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
