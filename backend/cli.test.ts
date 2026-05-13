import { describe, expect, test } from 'bun:test';
import { CliExit, DEFAULT_PORT, parseCliArgs } from './cli';

describe('parseCliArgs', () => {
  test('defaults: no args, no env', () => {
    const opts = parseCliArgs([], {});
    expect(opts.port).toBe(DEFAULT_PORT);
    expect(opts.open).toBe(true);
    expect(opts.dbPath).toMatch(/jottapp\.db$/);
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
    ['0', /invalid --port/],
    ['70000', /invalid --port/],
    ['4853.5', /invalid --port/],
  ])('invalid --port "%s" rejected', (input, match) => {
    expect(() => parseCliArgs(['--port', input], {})).toThrow(match);
  });

  test('--port=-1 rejected as negative', () => {
    expect(() => parseCliArgs(['--port=-1'], {})).toThrow(/invalid --port/);
  });

  test('--no-open disables auto-open', () => {
    expect(parseCliArgs(['--no-open'], {}).open).toBe(false);
  });

  test('--db overrides default', () => {
    expect(parseCliArgs(['--db', '/tmp/foo.db'], {}).dbPath).toBe('/tmp/foo.db');
  });

  test('--db flag wins over JOTTAPP_DB', () => {
    expect(parseCliArgs(['--db', '/tmp/flag.db'], { JOTTAPP_DB: '/tmp/env.db' }).dbPath).toBe(
      '/tmp/flag.db',
    );
  });

  test('JOTTAPP_DB env used when no flag', () => {
    expect(parseCliArgs([], { JOTTAPP_DB: '/tmp/env.db' }).dbPath).toBe('/tmp/env.db');
  });

  test('--help exits 0 with help text', () => {
    const thrown = catchThrown(() => parseCliArgs(['--help'], {}));
    expect(thrown).toBeInstanceOf(CliExit);
    expect((thrown as CliExit).code).toBe(0);
    expect((thrown as CliExit).output).toContain('jottapp');
    expect((thrown as CliExit).output).toContain('Usage:');
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
