import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from '../../db/migrate';
import * as schema from '../../db/schema';
import { appRouter } from '../router';
import { createCallerFactory } from '../trpc';

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
  return { caller: createCaller({ db, dbPath: ':memory:' }), raw };
}

describe('settings.getAll', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns empty object when nothing set', async () => {
    expect(await s.caller.settings.getAll()).toEqual({});
  });

  test('returns set values', async () => {
    await s.caller.settings.set({ key: 'claude.binary', value: '/usr/local/bin/claude' });
    expect(await s.caller.settings.getAll()).toEqual({
      'claude.binary': '/usr/local/bin/claude',
    });
  });
});

describe('settings.set', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('inserts a new value', async () => {
    await s.caller.settings.set({ key: 'claude.binary', value: 'claude' });
    const all = await s.caller.settings.getAll();
    expect(all['claude.binary']).toBe('claude');
  });

  test('updates an existing value (no duplicate)', async () => {
    await s.caller.settings.set({ key: 'claude.binary', value: 'claude' });
    await s.caller.settings.set({ key: 'claude.binary', value: '/opt/claude' });
    const rows = s.raw.query('SELECT COUNT(*) AS n FROM settings').get() as { n: number };
    expect(rows.n).toBe(1);
    const all = await s.caller.settings.getAll();
    expect(all['claude.binary']).toBe('/opt/claude');
  });

  test('empty value deletes the row', async () => {
    await s.caller.settings.set({ key: 'claude.binary', value: 'claude' });
    await s.caller.settings.set({ key: 'claude.binary', value: '' });
    expect(await s.caller.settings.getAll()).toEqual({});
  });

  test('rejects unknown key', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
      s.caller.settings.set({ key: 'unknown.key' as any, value: 'x' }),
    ).rejects.toThrow();
  });

  test('trims whitespace from value', async () => {
    await s.caller.settings.set({ key: 'claude.binary', value: '  claude  ' });
    const all = await s.caller.settings.getAll();
    expect(all['claude.binary']).toBe('claude');
  });

  test('rejects oversized value', async () => {
    await expect(
      s.caller.settings.set({ key: 'claude.binary', value: 'x'.repeat(1025) }),
    ).rejects.toThrow();
  });
});
