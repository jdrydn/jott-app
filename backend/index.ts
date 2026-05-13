import { VERSION } from '@shared/version';
import { CliExit, type CliOptions, parseCliArgs } from './cli';
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

  const app = createApp();

  try {
    const handle = serveApp({ port: opts.port, app });
    process.stdout.write(`jottapp v${VERSION} — ${handle.url}\n`);
    process.stdout.write('Press Ctrl+C to stop.\n');
  } catch (err) {
    if (err instanceof PortInUseError) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

main();
