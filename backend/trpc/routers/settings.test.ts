import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from '../../db/migrate';
import * as schema from '../../db/schema';
import { appRouter } from '../router';
import { createCallerFactory } from '../trpc';
import { SETTING_DEFAULTS } from './settings';

const createCaller = createCallerFactory(appRouter);

type Setup = {
  caller: ReturnType<typeof createCaller>;
  raw: Database;
};

function setup(): Setup {
  const raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return {
    caller: createCaller({
      db,
      raw,
      dbPath: ':memory:',
      attachmentsDir: '/tmp/jottapp-test-attachments',
      claude: { available: false, binaryPath: null, version: null },
    }),
    raw,
  };
}

describe('settings.getAll', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns the full defaults object when nothing stored', async () => {
    const all = await s.caller.settings.getAll();
    expect(all).toEqual({ ...SETTING_DEFAULTS });
  });

  test('overrides default with stored value', async () => {
    await s.caller.settings.set({ key: 'ai.claude.model', value: 'opus' });
    const all = await s.caller.settings.getAll();
    expect(all['ai.claude.model']).toBe('opus');
    expect(all['ai.driver']).toBe(SETTING_DEFAULTS['ai.driver']);
  });
});

describe('settings.set', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('inserts a new value', async () => {
    await s.caller.settings.set({ key: 'ai.claude.model', value: 'opus' });
    const all = await s.caller.settings.getAll();
    expect(all['ai.claude.model']).toBe('opus');
  });

  test('updates an existing value (no duplicate)', async () => {
    await s.caller.settings.set({ key: 'ai.claude.model', value: 'opus' });
    await s.caller.settings.set({ key: 'ai.claude.model', value: 'haiku' });
    const rows = s.raw.query('SELECT COUNT(*) AS n FROM settings').get() as { n: number };
    expect(rows.n).toBe(1);
    const all = await s.caller.settings.getAll();
    expect(all['ai.claude.model']).toBe('haiku');
  });

  test('empty value deletes the row and reverts to default', async () => {
    await s.caller.settings.set({ key: 'ai.claude.model', value: 'opus' });
    await s.caller.settings.set({ key: 'ai.claude.model', value: '' });
    const all = await s.caller.settings.getAll();
    expect(all['ai.claude.model']).toBe(SETTING_DEFAULTS['ai.claude.model']);
  });

  test('rejects unknown key', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
      s.caller.settings.set({ key: 'unknown.key' as any, value: 'x' }),
    ).rejects.toThrow();
  });

  test('trims whitespace from value', async () => {
    await s.caller.settings.set({ key: 'ai.claude.config-dir', value: '  /tmp/claude  ' });
    const all = await s.caller.settings.getAll();
    expect(all['ai.claude.config-dir']).toBe('/tmp/claude');
  });

  test('rejects oversized value', async () => {
    await expect(
      s.caller.settings.set({ key: 'ai.claude.model', value: 'x'.repeat(1025) }),
    ).rejects.toThrow();
  });
});

describe('SETTING_DEFAULTS', () => {
  test('exposes the expected keys', () => {
    expect(Object.keys(SETTING_DEFAULTS).sort()).toEqual([
      'ai.claude.config-dir',
      'ai.claude.model',
      'ai.driver',
      'backup.dir',
      'backup.onQuit',
    ]);
  });

  test('ai.claude.config-dir defaults to empty (driver uses its own default)', () => {
    expect(SETTING_DEFAULTS['ai.claude.config-dir']).toBe('');
  });

  test('backup.onQuit defaults to "false"', () => {
    expect(SETTING_DEFAULTS['backup.onQuit']).toBe('false');
  });

  test('backup.dir defaults to empty (resolved at runtime from db path)', () => {
    expect(SETTING_DEFAULTS['backup.dir']).toBe('');
  });
});
