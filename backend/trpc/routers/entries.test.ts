import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from '../../db/migrate';
import * as schema from '../../db/schema';
import { entryTags, tags } from '../../db/schema';
import { appRouter } from '../router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(appRouter);

type Setup = {
  caller: ReturnType<typeof createCaller>;
  raw: Database;
};

function setup(): Setup {
  const raw = new Database(':memory:');
  migrate(raw);
  const db = drizzle(raw, { schema });
  const caller = createCaller({ db });
  return { caller, raw };
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('entries.list', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns empty array on fresh db', async () => {
    expect(await s.caller.entries.list()).toEqual([]);
  });

  test('returns created entries newest-first', async () => {
    const a = await s.caller.entries.create({ body: 'first' });
    await Bun.sleep(2);
    const b = await s.caller.entries.create({ body: 'second' });
    const list = await s.caller.entries.list();
    expect(list.map((e) => e.id)).toEqual([b.id, a.id]);
  });

  test('omits soft-deleted entries', async () => {
    const a = await s.caller.entries.create({ body: 'kept' });
    const b = await s.caller.entries.create({ body: 'dropped' });
    s.raw.run('UPDATE entries SET deleted_at = ? WHERE id = ?', [Date.now(), b.id]);
    const list = await s.caller.entries.list();
    expect(list.map((e) => e.id)).toEqual([a.id]);
  });

  test('limit is honoured', async () => {
    for (let i = 0; i < 5; i++) {
      await s.caller.entries.create({ body: `e${i}` });
      await Bun.sleep(1);
    }
    const list = await s.caller.entries.list({ limit: 3 });
    expect(list).toHaveLength(3);
  });

  test('rejects invalid limit', async () => {
    await expect(s.caller.entries.list({ limit: 0 })).rejects.toThrow();
    await expect(s.caller.entries.list({ limit: 500 })).rejects.toThrow();
  });

  test('attaches tag links per entry', async () => {
    await s.caller.entries.create({ body: 'hi @priya' });
    const list = await s.caller.entries.list();
    expect(list[0]?.tags).toHaveLength(1);
    expect(list[0]?.tags[0]).toMatchObject({
      nameWhenLinked: 'priya',
      tag: { type: 'user', name: 'priya' },
    });
  });

  test('tag link reflects current tag.name after rename (display swap)', async () => {
    await s.caller.entries.create({ body: '#oldname is the topic' });
    const tag = (await s.caller.tags.list()).find((t) => t.name === 'oldname');
    if (!tag) throw new Error('unreachable');
    await s.caller.tags.rename({ id: tag.id, name: 'newname' });

    const list = await s.caller.entries.list();
    expect(list[0]?.tags[0]?.nameWhenLinked).toBe('oldname');
    expect(list[0]?.tags[0]?.tag.name).toBe('newname');
  });
});

describe('entries.create', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('inserts and returns the entry', async () => {
    const entry = await s.caller.entries.create({ body: 'hello' });
    expect(entry.id).toMatch(ULID_RE);
    expect(entry.body).toBe('hello');
    expect(entry.createdAt).toBeGreaterThan(0);
    expect(entry.updatedAt).toBe(entry.createdAt);
    expect(entry.deletedAt).toBeNull();
  });

  test('rejects empty body', async () => {
    await expect(s.caller.entries.create({ body: '' })).rejects.toThrow();
  });

  test('rejects oversized body', async () => {
    const huge = 'x'.repeat(100_001);
    await expect(s.caller.entries.create({ body: huge })).rejects.toThrow();
  });

  test('accepts a 100k-char body exactly', async () => {
    const big = 'x'.repeat(100_000);
    const e = await s.caller.entries.create({ body: big });
    expect(e.body).toHaveLength(100_000);
  });

  test('generates unique ULIDs', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const e = await s.caller.entries.create({ body: `e${i}` });
      ids.add(e.id);
    }
    expect(ids.size).toBe(10);
  });

  test('reconciles tags from body on create', async () => {
    const db = drizzle(s.raw, { schema });
    const entry = await s.caller.entries.create({ body: 'met @priya about #q3-plan' });
    const allTags = db.select().from(tags).all();
    expect(allTags.map((t) => `${t.type}:${t.name}`).sort()).toEqual([
      'topic:q3-plan',
      'user:priya',
    ]);
    const links = db.select().from(entryTags).where(eq(entryTags.entryId, entry.id)).all();
    expect(links).toHaveLength(2);
  });
});
