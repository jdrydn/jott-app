import { parseArgs } from 'node:util';
import { VERSION } from '@shared/version';
import { defaultDbPath } from './paths';

export const DEFAULT_PORT = 4853;

export type CliOptions = {
  port: number;
  open: boolean;
  dbPath: string;
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
  --port <number>     Server port (default: ${DEFAULT_PORT}, env: JOTTAPP_PORT)
  --no-open           Don't auto-open the browser on start
  --db <path>         SQLite database location (env: JOTTAPP_DB)
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
      'no-open': { type: 'boolean' },
      db: { type: 'string' },
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
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new CliExit(2, `error: invalid --port "${portRaw}" — must be 1–65535`);
    }
    port = n;
  }

  const open = !(values['no-open'] ?? false);
  const dbPath = values.db ?? env.JOTTAPP_DB ?? defaultDbPath();

  return { port, open, dbPath };
}
