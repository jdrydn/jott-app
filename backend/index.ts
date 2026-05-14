import { VERSION } from '@shared/version';
import { CliExit, type CliOptions, parseCliArgs } from './cli';
import { openDb } from './db/client';
import { seedDemoData } from './db/seed';
import { openBrowser } from './openBrowser';
import { createApp, PortInUseError, serveApp } from './server';

function main(): void {
  let opts: CliOptions;
  try {
    opts = parseCliArgs(process.argv.slice(2), process.env);
  } catch (err) {
    if (err instanceof CliExit) {
      const stream = err.code === 0 ? process.stdout : process.stderr;
      stream.write(`${err.output}\n`);
      process.exit(err.code);
    }
    throw err;
  }

  const dbHandle = openDb(opts.dbPath);

  if (opts.seedDb) {
    const existing = dbHandle.raw.query('SELECT COUNT(*) as n FROM entries').get() as {
      n: number;
    };
    if (existing.n === 0) {
      const seeded = seedDemoData(dbHandle.db);
      process.stdout.write(`seeded ${seeded} demo entries\n`);
    } else {
      process.stdout.write(`db has ${existing.n} entries — skipping seed\n`);
    }
  }

  const app = createApp({ db: dbHandle.db });

  try {
    const handle = serveApp({ port: opts.port, app });
    const openingNote = opts.open ? ' (opening browser…)' : '';
    process.stdout.write(`jottapp v${VERSION} — ${handle.url}${openingNote}\n`);
    process.stdout.write(`db: ${opts.dbPath}\n`);
    process.stdout.write('Press Ctrl+C to stop.\n');
    if (opts.open) openBrowser(handle.url);
  } catch (err) {
    dbHandle.close();
    if (err instanceof PortInUseError) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const shutdown = (): void => {
    dbHandle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
