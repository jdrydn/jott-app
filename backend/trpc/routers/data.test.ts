import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from '../../db/migrate';
import * as schema from '../../db/schema';
import { appRouter } from '../router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(appRouter);

type Setup = {
  caller: ReturnType<typeof createCaller>;
  raw: Database;
  workdir: string;
  dbPath: string;
  cleanup: () => void;
};

function memorySetup(): { caller: ReturnType<typeof createCaller>; raw: Database } {
  const raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return {
    caller: createCaller({
      db,
      raw,
      dbPath: ':memory:',
      claude: { available: false, binaryPath: null, version: null },
    }),
    raw,
  };
}

function diskSetup(): Setup {
  const workdir = mkdtempSync(join(tmpdir(), 'jottapp-data-'));
  const dbPath = join(workdir, 'jottapp.db');
  const raw = new Database(dbPath, { create: true });
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA journal_mode = WAL');
  migrate(raw);
  const db = drizzle(raw, { schema });
  const caller = createCaller({
    db,
    raw,
    dbPath,
    claude: { available: false, binaryPath: null, version: null },
  });
  return {
    caller,
    raw,
    workdir,
    dbPath,
    cleanup: () => {
      raw.close();
      rmSync(workdir, { recursive: true, force: true });
    },
  };
}

describe('data.exportMarkdown', () => {
  test('returns empty markdown header for an empty db', async () => {
    const { caller } = memorySetup();
    const out = await caller.data.exportMarkdown();
    expect(out.count).toBe(0);
    expect(out.text).toContain('<!-- 0 entries -->');
    expect(out.filename).toMatch(/^jottapp-export-\d{4}-\d{2}-\d{2}\.md$/);
  });

  test('includes live entries oldest-first', async () => {
    const { caller } = memorySetup();
    const a = await caller.entries.create({ body: 'first #topic' });
    await Bun.sleep(2);
    const b = await caller.entries.create({ body: 'second @user' });

    const out = await caller.data.exportMarkdown();
    expect(out.count).toBe(2);
    const firstIndex = out.text.indexOf(a.id);
    const secondIndex = out.text.indexOf(b.id);
    expect(firstIndex).toBeGreaterThan(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  test('excludes soft-deleted entries', async () => {
    const { caller } = memorySetup();
    const a = await caller.entries.create({ body: 'kept' });
    const b = await caller.entries.create({ body: 'dropped' });
    await caller.entries.delete({ id: b.id });

    const out = await caller.data.exportMarkdown();
    expect(out.count).toBe(1);
    expect(out.text).toContain(a.id);
    expect(out.text).not.toContain(b.id);
  });
});

describe('data.importMarkdown', () => {
  test('round-trips: export → import on a fresh db re-creates entries', async () => {
    const src = memorySetup();
    const a = await src.caller.entries.create({ body: 'first with #plan and @priya' });
    await Bun.sleep(2);
    const b = await src.caller.entries.create({ body: 'second\n\nmultiline body' });
    const exported = await src.caller.data.exportMarkdown();

    const dest = memorySetup();
    const result = await dest.caller.data.importMarkdown({ text: exported.text });
    expect(result).toEqual({ imported: 2, skipped: 0, total: 2 });

    const list = await dest.caller.entries.list();
    const ids = list.map((e) => e.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
    const tags = await dest.caller.tags.list();
    expect(tags.map((t) => t.name).sort()).toEqual(['plan', 'priya']);
  });

  test('skips entries whose IDs already exist', async () => {
    const src = memorySetup();
    const a = await src.caller.entries.create({ body: 'first' });
    const exported = await src.caller.data.exportMarkdown();

    const result = await src.caller.data.importMarkdown({ text: exported.text });
    expect(result).toEqual({ imported: 0, skipped: 1, total: 1 });

    const list = await src.caller.entries.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(a.id);
  });

  test('rejects malformed markdown with BAD_REQUEST', async () => {
    const { caller } = memorySetup();
    const bad = '<!-- @entry id="01H" created="not-a-date" updated="bad" -->\nbody';
    await expect(caller.data.importMarkdown({ text: bad })).rejects.toThrow();
  });

  test('zero entries in markdown is a clean no-op', async () => {
    const { caller } = memorySetup();
    const empty = '<!-- jott export -->\n<!-- 0 entries -->\n';
    const result = await caller.data.importMarkdown({ text: empty });
    expect(result).toEqual({ imported: 0, skipped: 0, total: 0 });
  });
});

describe('data.backup', () => {
  let s: Setup;
  beforeEach(() => {
    s = diskSetup();
  });
  afterEach(() => {
    s.cleanup();
  });

  test('writes a snapshot to the default dir', async () => {
    await s.caller.entries.create({ body: 'hello' });
    const result = await s.caller.data.backup();
    expect(result.path).toContain(join(s.workdir, 'backups'));
    expect(existsSync(result.path)).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
  });

  test('honours backup.dir setting when set', async () => {
    const custom = join(s.workdir, 'mine');
    await s.caller.settings.set({ key: 'backup.dir', value: custom });
    const result = await s.caller.data.backup();
    expect(result.path.startsWith(custom)).toBe(true);
  });

  test('throws PRECONDITION_FAILED for an in-memory db', async () => {
    const { caller } = memorySetup();
    await expect(caller.data.backup()).rejects.toThrow(/in-memory/);
  });
});

describe('data.backupDirPreview', () => {
  let s: Setup;
  beforeEach(() => {
    s = diskSetup();
  });
  afterEach(() => {
    s.cleanup();
  });

  test('reports the default dir when unconfigured', async () => {
    const preview = await s.caller.data.backupDirPreview();
    expect(preview.isDefault).toBe(true);
    expect(preview.resolved).toBe(join(s.workdir, 'backups'));
  });

  test('reports the configured dir when set', async () => {
    const custom = join(s.workdir, 'mine');
    await s.caller.settings.set({ key: 'backup.dir', value: custom });
    const preview = await s.caller.data.backupDirPreview();
    expect(preview.isDefault).toBe(false);
    expect(preview.resolved).toBe(custom);
  });
});
