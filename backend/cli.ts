import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { VERSION } from '@shared/version';
import { defaultDataDir } from './paths';

export const DEFAULT_PORT = 4853;

export type CliOptions = {
  port: number;
  open: boolean;
  dataDir: string;
  dbPath: string;
  seedDb: boolean;
  clearDb: boolean;
};

export class CliExit extends Error {
  constructor(
    public readonly code: number,
    public readonly output: string,
  ) {
    super(output);
    this.name = 'CliExit';
  }
}

const HELP = `jottapp v${VERSION} — Jot it down.

Usage:
  jottapp [options]

Options:
  --port <number>     Server port (default: ${DEFAULT_PORT}, env: JOTTAPP_PORT, 0 = random)
  --open              Auto-open the browser on start
  --data-dir <path>   Data directory for jottapp.db and attachments/ (env: JOTT_DATA_DIR)
  --seed-db           Seed demo journal data if the database is empty
  --clear-db          Destroy and recreate the database file (prompts y/N)
  -v, --version       Print version and exit
  -h, --help          Print this help and exit
`;

export function parseCliArgs(
  argv: string[],
  env: Record<string, string | undefined> = {},
): CliOptions {
  const parsed = parseArgs({
    args: argv,
    options: {
      port: { type: 'string' },
      open: { type: 'boolean' },
      'data-dir': { type: 'string' },
      'seed-db': { type: 'boolean' },
      'clear-db': { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  const values = parsed.values;

  if (values.help) throw new CliExit(0, HELP);
  if (values.version) throw new CliExit(0, `jottapp v${VERSION}`);

  const portRaw = values.port ?? env.JOTTAPP_PORT;
  let port = DEFAULT_PORT;
  if (portRaw !== undefined) {
    const n = Number(portRaw);
    if (!Number.isInteger(n) || n < 0 || n > 65535) {
      throw new CliExit(2, `error: invalid --port "${portRaw}" — must be 0–65535 (0 = random)`);
    }
    port = n;
  }

  const open = values.open ?? false;
  const dataDir = values['data-dir'] ?? env.JOTT_DATA_DIR ?? defaultDataDir();
  const dbPath = join(dataDir, 'jottapp.db');
  const seedDb = values['seed-db'] ?? false;
  const clearDb = values['clear-db'] ?? false;

  return { port, open, dataDir, dbPath, seedDb, clearDb };
}
