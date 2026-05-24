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

describe('search.query — people', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('substring-matches a person label case-insensitively', async () => {
    await s.caller.tags.create({ type: 'person', name: 'James Dryden' });
    await s.caller.tags.create({ type: 'person', name: 'Priya' });

    const hit = (await s.caller.search.query({ q: 'jam' })).people;
    expect(hit.map((p) => p.name)).toEqual(['James Dryden']);
  });

  test('orders people by entry_count desc', async () => {
    await s.caller.entries.create({ body: 'hi @alice' });
    await s.caller.entries.create({ body: 'again @alice' });
    await s.caller.entries.create({ body: 'one with @amy' });

    const hits = (await s.caller.search.query({ q: 'a' })).people;
    expect(hits[0]?.name).toBe('alice');
    expect(hits[0]?.entryCount).toBe(2);
    expect(hits[1]?.name).toBe('amy');
    expect(hits[1]?.entryCount).toBe(1);
  });

  test('caps people results at 5', async () => {
    for (const n of ['ann', 'anna', 'anne', 'annie', 'anders', 'antonio']) {
      await s.caller.tags.create({ type: 'person', name: n });
    }
    const hits = (await s.caller.search.query({ q: 'an' })).people;
    expect(hits).toHaveLength(5);
  });

  test('does not include topics in the people section', async () => {
    await s.caller.tags.create({ type: 'topic', name: 'james-talk' });
    await s.caller.tags.create({ type: 'person', name: 'James' });

    const result = await s.caller.search.query({ q: 'jam' });
    expect(result.people.map((p) => p.name)).toEqual(['James']);
    expect(result.topics.map((t) => t.name)).toEqual(['james-talk']);
  });

  test('returns entryCount = 0 for tag with no entries', async () => {
    await s.caller.tags.create({ type: 'person', name: 'orphan' });
    const hits = (await s.caller.search.query({ q: 'orphan' })).people;
    expect(hits[0]?.entryCount).toBe(0);
  });

  test('escapes LIKE wildcards in the query', async () => {
    await s.caller.tags.create({ type: 'person', name: 'Alpha' });
    await s.caller.tags.create({ type: 'person', name: 'Beta' });

    // `%` should be treated as a literal, not a wildcard — so no matches.
    const hits = (await s.caller.search.query({ q: '%' })).people;
    expect(hits).toEqual([]);
  });
});

describe('search.query — topics', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('substring-matches topics and partitions correctly', async () => {
    await s.caller.entries.create({ body: 'sync about #q3-plan' });
    await s.caller.entries.create({ body: 'sync about #q4-plan' });

    const hits = (await s.caller.search.query({ q: 'q' })).topics;
    expect(hits.map((t) => t.name).sort()).toEqual(['q3-plan', 'q4-plan']);
  });

  test('returns empty topics when nothing matches', async () => {
    await s.caller.entries.create({ body: 'about #work' });
    const hits = (await s.caller.search.query({ q: 'nothinglikeme' })).topics;
    expect(hits).toEqual([]);
  });
});

describe('search.query — entries (FTS)', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns body matches with snippet + createdAt', async () => {
    const created = await s.caller.entries.create({
      body: 'shipping the launch with @priya',
    });
    await s.caller.entries.create({ body: 'rolling back the migration' });

    const hits = (await s.caller.search.query({ q: 'launch' })).entries;
    expect(hits).toHaveLength(1);
    expect(hits[0]?.entryId).toBe(created.id);
    expect(hits[0]?.snippet).toContain('[launch]');
    expect(hits[0]?.createdAt).toBe(created.createdAt);
  });

  test('prefix-matches the last alnum token', async () => {
    await s.caller.entries.create({ body: 'production rollout incoming' });
    await s.caller.entries.create({ body: 'staging tests passing' });

    const hits = (await s.caller.search.query({ q: 'roll' })).entries;
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snippet).toContain('rollout');
  });

  test('strips leading sigils so #q3 still matches', async () => {
    await s.caller.entries.create({ body: 'about #q3-plan' });
    const hits = (await s.caller.search.query({ q: '#q3' })).entries;
    expect(hits).toHaveLength(1);
  });

  test('excludes soft-deleted entries', async () => {
    const a = await s.caller.entries.create({ body: 'launch announcement' });
    await s.caller.entries.delete({ id: a.id });

    const hits = (await s.caller.search.query({ q: 'launch' })).entries;
    expect(hits).toEqual([]);
  });

  test('reflects edits after entries.update (FTS triggers fire)', async () => {
    const created = await s.caller.entries.create({ body: 'first body about apples' });
    let hits = (await s.caller.search.query({ q: 'apples' })).entries;
    expect(hits).toHaveLength(1);

    await s.caller.entries.update({ id: created.id, body: 'rewritten about oranges' });

    hits = (await s.caller.search.query({ q: 'apples' })).entries;
    expect(hits).toHaveLength(0);
    hits = (await s.caller.search.query({ q: 'oranges' })).entries;
    expect(hits).toHaveLength(1);
  });

  test('caps entries at 10', async () => {
    for (let i = 0; i < 12; i++) {
      await s.caller.entries.create({ body: `launch run ${i}` });
    }
    const hits = (await s.caller.search.query({ q: 'launch' })).entries;
    expect(hits).toHaveLength(10);
  });
});

describe('search.query — input validation + edge cases', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('rejects empty / oversized q', async () => {
    await expect(s.caller.search.query({ q: '' })).rejects.toThrow();
    await expect(s.caller.search.query({ q: 'x'.repeat(201) })).rejects.toThrow();
  });

  test('returns empty entries for query with no extractable tokens', async () => {
    await s.caller.entries.create({ body: 'something' });
    const result = await s.caller.search.query({ q: '!!!' });
    expect(result.entries).toEqual([]);
  });

  test('a single query populates all three sections together', async () => {
    await s.caller.entries.create({ body: 'sync with @alpha-person about #alpha-topic' });
    // create extra tags so the substring "alpha" hits both types
    await s.caller.entries.create({ body: 'note about alpha launch' });

    const result = await s.caller.search.query({ q: 'alpha' });
    expect(result.people.map((p) => p.name)).toEqual(['alpha-person']);
    expect(result.topics.map((t) => t.name)).toEqual(['alpha-topic']);
    expect(result.entries.length).toBeGreaterThan(0);
  });
});
