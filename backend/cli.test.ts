import { describe, expect, test } from 'bun:test';
import { CliExit, DEFAULT_PORT, parseCliArgs } from './cli';

describe('parseCliArgs', () => {
  test('defaults: no args, no env', () => {
    const opts = parseCliArgs([], {});
    expect(opts.port).toBe(DEFAULT_PORT);
    expect(opts.open).toBe(false);
    expect(opts.dataDir).toMatch(/jottapp$/);
    expect(opts.dbPath).toMatch(/jottapp\/jottapp\.db$|jottapp\\jottapp\.db$/);
    expect(opts.seedDb).toBe(false);
    expect(opts.clearDb).toBe(false);
  });

  test('--seed-db enables demo seeding', () => {
    expect(parseCliArgs(['--seed-db'], {}).seedDb).toBe(true);
  });

  test('--clear-db opts in to db wipe', () => {
    expect(parseCliArgs(['--clear-db'], {}).clearDb).toBe(true);
  });

  test('--clear-db + --seed-db can combine', () => {
    const opts = parseCliArgs(['--clear-db', '--seed-db'], {});
    expect(opts.clearDb).toBe(true);
    expect(opts.seedDb).toBe(true);
  });

  test('--port overrides default', () => {
    expect(parseCliArgs(['--port', '8080'], {}).port).toBe(8080);
  });

  test('--port falls back to JOTTAPP_PORT', () => {
    expect(parseCliArgs([], { JOTTAPP_PORT: '9000' }).port).toBe(9000);
  });

  test('--port flag wins over env', () => {
    expect(parseCliArgs(['--port', '8080'], { JOTTAPP_PORT: '9000' }).port).toBe(8080);
  });

  test.each([
    ['abc', /invalid --port/],
    ['70000', /invalid --port/],
    ['4853.5', /invalid --port/],
  ])('invalid --port "%s" rejected', (input, match) => {
    expect(() => parseCliArgs(['--port', input], {})).toThrow(match);
  });

  test('--port 0 is accepted (request random port)', () => {
    expect(parseCliArgs(['--port', '0'], {}).port).toBe(0);
  });

  test('--port=-1 rejected as negative', () => {
    expect(() => parseCliArgs(['--port=-1'], {})).toThrow(/invalid --port/);
  });

  test('--open opts in to auto-open', () => {
    expect(parseCliArgs(['--open'], {}).open).toBe(true);
  });

  test('--data-dir sets the data directory', () => {
    const opts = parseCliArgs(['--data-dir', '/tmp/data'], {});
    expect(opts.dataDir).toBe('/tmp/data');
    expect(opts.dbPath).toBe('/tmp/data/jottapp.db');
  });

  test('--data-dir flag wins over JOTT_DATA_DIR', () => {
    const opts = parseCliArgs(['--data-dir', '/tmp/flag'], { JOTT_DATA_DIR: '/tmp/env' });
    expect(opts.dataDir).toBe('/tmp/flag');
  });

  test('JOTT_DATA_DIR env used when no flag', () => {
    const opts = parseCliArgs([], { JOTT_DATA_DIR: '/tmp/env' });
    expect(opts.dataDir).toBe('/tmp/env');
    expect(opts.dbPath).toBe('/tmp/env/jottapp.db');
  });

  test('--help exits 0 with help text', () => {
    const thrown = catchThrown(() => parseCliArgs(['--help'], {}));
    expect(thrown).toBeInstanceOf(CliExit);
    expect((thrown as CliExit).code).toBe(0);
    expect((thrown as CliExit).output).toContain('jottapp');
    expect((thrown as CliExit).output).toContain('Usage:');
    expect((thrown as CliExit).output).toContain('--clear-db');
    expect((thrown as CliExit).output).toContain('--data-dir');
  });

  test('-h is alias for --help', () => {
    const thrown = catchThrown(() => parseCliArgs(['-h'], {}));
    expect((thrown as CliExit).code).toBe(0);
    expect((thrown as CliExit).output).toContain('Usage:');
  });

  test('--version exits 0 with version', () => {
    const thrown = catchThrown(() => parseCliArgs(['--version'], {}));
    expect(thrown).toBeInstanceOf(CliExit);
    expect((thrown as CliExit).code).toBe(0);
    expect((thrown as CliExit).output).toMatch(/^jottapp v/);
  });

  test('-v is alias for --version', () => {
    const thrown = catchThrown(() => parseCliArgs(['-v'], {}));
    expect((thrown as CliExit).output).toMatch(/^jottapp v/);
  });

  test('unknown flag rejected', () => {
    expect(() => parseCliArgs(['--unknown'], {})).toThrow();
  });

  test('positional args rejected', () => {
    expect(() => parseCliArgs(['some-positional'], {})).toThrow();
  });
});

function catchThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected fn to throw');
}
