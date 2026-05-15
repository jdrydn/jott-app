import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
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
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return { caller: createCaller({ db, dbPath: ':memory:' }), raw };
}

describe('tags.list', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns empty on fresh db', async () => {
    expect(await s.caller.tags.list()).toEqual([]);
  });

  test('returns tags with count + lastSeen aggregates', async () => {
    await s.caller.entries.create({ body: 'first @priya about #q3-plan' });
    await Bun.sleep(2);
    await s.caller.entries.create({ body: '@priya again' });

    const list = await s.caller.tags.list();
    const byKey = new Map(list.map((t) => [`${t.type}:${t.name}`, t]));
    expect(byKey.get('user:priya')?.count).toBe(2);
    expect(byKey.get('topic:q3-plan')?.count).toBe(1);
    const priya = byKey.get('user:priya');
    expect(priya?.lastSeen).toBeGreaterThan(byKey.get('topic:q3-plan')?.lastSeen ?? 0);
  });

  test('newly created tag with no links has count 0 and lastSeen null', async () => {
    const db = drizzle(s.raw, { schema });
    db.insert(tags)
      .values({
        id: '01ORPHAN',
        type: 'topic',
        name: 'orphan',
        initials: 'OR',
        color: '#000000',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    const list = await s.caller.tags.list();
    const orphan = list.find((t) => t.name === 'orphan');
    expect(orphan?.count).toBe(0);
    expect(orphan?.lastSeen).toBeNull();
  });
});

describe('tags.rename', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('renames a tag in place; entry body and nameWhenLinked untouched', async () => {
    await s.caller.entries.create({ body: '#oldname is the tag' });
    const list = await s.caller.tags.list();
    const tag = list.find((t) => t.name === 'oldname');
    expect(tag).toBeDefined();

    if (!tag) throw new Error('unreachable');
    const renamed = await s.caller.tags.rename({ id: tag.id, name: 'newname' });
    expect(renamed.name).toBe('newname');

    const db = drizzle(s.raw, { schema });
    const after = db.select().from(tags).all();
    const target = after.find((t) => t.id === tag.id);
    expect(target?.name).toBe('newname');

    const links = db.select().from(entryTags).all();
    expect(links[0]?.nameWhenLinked).toBe('oldname');
  });

  test('rejects collision with existing same-type name', async () => {
    await s.caller.entries.create({ body: '#alpha and #beta' });
    const list = await s.caller.tags.list();
    const alpha = list.find((t) => t.name === 'alpha');
    if (!alpha) throw new Error('unreachable');
    await expect(s.caller.tags.rename({ id: alpha.id, name: 'beta' })).rejects.toThrow();
  });

  test('allows renaming to the same value (no-op semantics)', async () => {
    await s.caller.entries.create({ body: '#same' });
    const tag = (await s.caller.tags.list()).find((t) => t.name === 'same');
    if (!tag) throw new Error('unreachable');
    const renamed = await s.caller.tags.rename({ id: tag.id, name: 'same' });
    expect(renamed.name).toBe('same');
  });

  test('rejects invalid name format', async () => {
    await s.caller.entries.create({ body: '#valid' });
    const tag = (await s.caller.tags.list()).find((t) => t.name === 'valid');
    if (!tag) throw new Error('unreachable');
    await expect(s.caller.tags.rename({ id: tag.id, name: '1bad' })).rejects.toThrow();
    await expect(s.caller.tags.rename({ id: tag.id, name: 'bad name' })).rejects.toThrow();
  });

  test('throws NOT_FOUND for unknown id', async () => {
    await expect(s.caller.tags.rename({ id: 'nope', name: 'x' })).rejects.toThrow();
  });

  test('does not collide across types (topic vs user)', async () => {
    await s.caller.entries.create({ body: '#work and @work' });
    const list = await s.caller.tags.list();
    const topic = list.find((t) => t.type === 'topic' && t.name === 'work');
    if (!topic) throw new Error('unreachable');
    await s.caller.tags.rename({ id: topic.id, name: 'team' });
  });
});

describe('tags.delete', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('deletes the tag and cascades entry_tags', async () => {
    await s.caller.entries.create({ body: '#cascade test' });
    const tag = (await s.caller.tags.list()).find((t) => t.name === 'cascade');
    if (!tag) throw new Error('unreachable');

    await s.caller.tags.delete({ id: tag.id });
    const remaining = await s.caller.tags.list();
    expect(remaining.find((t) => t.id === tag.id)).toBeUndefined();

    const db = drizzle(s.raw, { schema });
    const links = db.select().from(entryTags).all();
    expect(links).toHaveLength(0);
  });

  test('throws NOT_FOUND for unknown id', async () => {
    await expect(s.caller.tags.delete({ id: 'nope' })).rejects.toThrow();
  });
});
