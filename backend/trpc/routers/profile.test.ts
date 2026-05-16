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

describe('profile.get', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns null when no profile exists', async () => {
    expect(await s.caller.profile.get()).toBeNull();
  });

  test('returns the singleton row after upsert', async () => {
    await s.caller.profile.upsert({ name: 'James' });
    const got = await s.caller.profile.get();
    expect(got?.id).toBe('me');
    expect(got?.name).toBe('James');
    expect(got?.theme).toBe('system');
  });
});

describe('profile.upsert', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('creates the singleton row on first call', async () => {
    const created = await s.caller.profile.upsert({ name: 'James' });
    expect(created.id).toBe('me');
    expect(created.name).toBe('James');
    expect(created.theme).toBe('system');
    expect(created.createdAt).toBeGreaterThan(0);
  });

  test('updates name and theme without creating a duplicate', async () => {
    const first = await s.caller.profile.upsert({ name: 'James' });
    const second = await s.caller.profile.upsert({ name: 'James D', theme: 'dark' });
    expect(second.name).toBe('James D');
    expect(second.theme).toBe('dark');
    expect(second.createdAt).toBe(first.createdAt);
  });

  test('omitting theme on update preserves the existing value', async () => {
    await s.caller.profile.upsert({ name: 'A', theme: 'dark' });
    const after = await s.caller.profile.upsert({ name: 'B' });
    expect(after.theme).toBe('dark');
  });

  test('rejects empty name', async () => {
    await expect(s.caller.profile.upsert({ name: '' })).rejects.toThrow();
    await expect(s.caller.profile.upsert({ name: '   ' })).rejects.toThrow();
  });

  test('rejects oversized name', async () => {
    await expect(s.caller.profile.upsert({ name: 'x'.repeat(65) })).rejects.toThrow();
  });

  test('trims surrounding whitespace from name', async () => {
    const created = await s.caller.profile.upsert({ name: '  Jay  ' });
    expect(created.name).toBe('Jay');
  });
});
