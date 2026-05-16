import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { ulid } from 'ulid';
import { writeAttachment } from '../../data/attachments';
import { migrate } from '../../db/migrate';
import * as schema from '../../db/schema';
import { attachments, entryTags, tags } from '../../db/schema';
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
  const caller = createCaller({
    db,
    raw,
    dbPath: ':memory:',
    attachmentsDir: '/tmp/jottapp-test-attachments',
    claude: { available: false, binaryPath: null, version: null },
  });
  return { caller, raw };
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('entries.list', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns empty page on fresh db', async () => {
    const page = await s.caller.entries.list();
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  test('returns created entries newest-first', async () => {
    const a = await s.caller.entries.create({ body: 'first' });
    await Bun.sleep(2);
    const b = await s.caller.entries.create({ body: 'second' });
    const { items } = await s.caller.entries.list();
    expect(items.map((e) => e.id)).toEqual([b.id, a.id]);
  });

  test('omits soft-deleted entries', async () => {
    const a = await s.caller.entries.create({ body: 'kept' });
    const b = await s.caller.entries.create({ body: 'dropped' });
    s.raw.run('UPDATE entries SET deleted_at = ? WHERE id = ?', [Date.now(), b.id]);
    const { items } = await s.caller.entries.list();
    expect(items.map((e) => e.id)).toEqual([a.id]);
  });

  test('limit is honoured', async () => {
    for (let i = 0; i < 5; i++) {
      await s.caller.entries.create({ body: `e${i}` });
      await Bun.sleep(1);
    }
    const { items } = await s.caller.entries.list({ limit: 3 });
    expect(items).toHaveLength(3);
  });

  test('rejects invalid limit', async () => {
    await expect(s.caller.entries.list({ limit: 0 })).rejects.toThrow();
    await expect(s.caller.entries.list({ limit: 500 })).rejects.toThrow();
  });

  test('attaches tag links per entry', async () => {
    await s.caller.entries.create({ body: 'hi @priya' });
    const { items } = await s.caller.entries.list();
    expect(items[0]?.tags).toHaveLength(1);
    expect(items[0]?.tags[0]?.tag).toMatchObject({ type: 'user', name: 'priya' });
  });

  test('tag link reflects current tag.name after rename', async () => {
    await s.caller.entries.create({ body: '#oldname is the topic' });
    const tag = (await s.caller.tags.list()).find((t) => t.name === 'oldname');
    if (!tag) throw new Error('unreachable');
    await s.caller.tags.rename({ id: tag.id, name: 'newname' });

    const { items } = await s.caller.entries.list();
    expect(items[0]?.tags[0]?.tag.name).toBe('newname');
  });
});

describe('entries.list pagination', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('nextCursor is null when no more pages', async () => {
    await s.caller.entries.create({ body: 'only' });
    const page = await s.caller.entries.list();
    expect(page.nextCursor).toBeNull();
  });

  test('walks every entry in order across pages, no duplicates', async () => {
    const created: string[] = [];
    for (let i = 0; i < 7; i++) {
      const e = await s.caller.entries.create({ body: `e${i}` });
      created.push(e.id);
      await Bun.sleep(1);
    }
    const expectedOrder = [...created].reverse();

    const seen: string[] = [];
    let cursor: { ts: number; id: string } | null = null;
    while (true) {
      const page = await s.caller.entries.list({ limit: 3, cursor });
      seen.push(...page.items.map((e) => e.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(expectedOrder);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('paginates trash by deletedAt', async () => {
    const a = await s.caller.entries.create({ body: 'a' });
    const b = await s.caller.entries.create({ body: 'b' });
    const c = await s.caller.entries.create({ body: 'c' });
    await s.caller.entries.delete({ id: a.id });
    await Bun.sleep(1);
    await s.caller.entries.delete({ id: b.id });
    await Bun.sleep(1);
    await s.caller.entries.delete({ id: c.id });

    const first = await s.caller.entries.list({ trash: true, limit: 2 });
    expect(first.items.map((e) => e.id)).toEqual([c.id, b.id]);
    expect(first.nextCursor).not.toBeNull();

    const second = await s.caller.entries.list({
      trash: true,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.map((e) => e.id)).toEqual([a.id]);
    expect(second.nextCursor).toBeNull();
  });

  test('breaks createdAt ties via id (deterministic order across pages)', async () => {
    const now = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const e = await s.caller.entries.create({ body: `e${i}` });
      ids.push(e.id);
    }
    s.raw.run('UPDATE entries SET created_at = ?', [now]);

    const expectedOrder = [...ids].sort().reverse();
    const seen: string[] = [];
    let cursor: { ts: number; id: string } | null = null;
    while (true) {
      const page = await s.caller.entries.list({ limit: 2, cursor });
      seen.push(...page.items.map((e) => e.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(expectedOrder);
  });

  test('cursor + tagId together still page correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await s.caller.entries.create({ body: `#work entry ${i}` });
      await Bun.sleep(1);
    }
    const work = (await s.caller.tags.list()).find((t) => t.name === 'work');
    if (!work) throw new Error('unreachable');

    const first = await s.caller.entries.list({ tagId: work.id, limit: 2 });
    const second = await s.caller.entries.list({
      tagId: work.id,
      limit: 2,
      cursor: first.nextCursor,
    });
    const third = await s.caller.entries.list({
      tagId: work.id,
      limit: 2,
      cursor: second.nextCursor,
    });

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
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

describe('entries.update', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('updates body, bumps updatedAt, preserves createdAt', async () => {
    const created = await s.caller.entries.create({ body: 'original' });
    await Bun.sleep(2);
    const updated = await s.caller.entries.update({ id: created.id, body: 'edited' });
    expect(updated.id).toBe(created.id);
    expect(updated.body).toBe('edited');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  test('reconciles tags on update — adds new, removes stale', async () => {
    const db = drizzle(s.raw, { schema });
    const created = await s.caller.entries.create({ body: 'about #q3-plan' });
    const before = db.select().from(entryTags).where(eq(entryTags.entryId, created.id)).all();
    expect(before).toHaveLength(1);

    await s.caller.entries.update({ id: created.id, body: 'about #q4-plan and @priya' });

    const after = db.select().from(entryTags).where(eq(entryTags.entryId, created.id)).all();
    expect(after).toHaveLength(2);
    const names = (await s.caller.tags.list()).filter((t) => t.count > 0).map((t) => t.name);
    expect(names.sort()).toEqual(['priya', 'q4-plan']);
  });

  test('rejects update on missing id', async () => {
    await expect(s.caller.entries.update({ id: 'nope', body: 'x' })).rejects.toThrow();
  });

  test('rejects update on a soft-deleted entry', async () => {
    const created = await s.caller.entries.create({ body: 'doomed' });
    s.raw.run('UPDATE entries SET deleted_at = ? WHERE id = ?', [Date.now(), created.id]);
    await expect(s.caller.entries.update({ id: created.id, body: 'too late' })).rejects.toThrow();
  });

  test('rejects empty / oversized body', async () => {
    const created = await s.caller.entries.create({ body: 'hello' });
    await expect(s.caller.entries.update({ id: created.id, body: '' })).rejects.toThrow();
    await expect(
      s.caller.entries.update({ id: created.id, body: 'x'.repeat(100_001) }),
    ).rejects.toThrow();
  });
});

describe('entries.delete + restore', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('soft-deletes the entry', async () => {
    const created = await s.caller.entries.create({ body: 'doomed' });
    const deleted = await s.caller.entries.delete({ id: created.id });
    expect(deleted.id).toBe(created.id);
    expect(deleted.deletedAt).toBeGreaterThan(0);
    const { items } = await s.caller.entries.list();
    expect(items.find((e) => e.id === created.id)).toBeUndefined();
  });

  test('list({trash:true}) returns only deleted entries', async () => {
    const a = await s.caller.entries.create({ body: 'kept' });
    const b = await s.caller.entries.create({ body: 'dropped' });
    await s.caller.entries.delete({ id: b.id });

    const live = await s.caller.entries.list();
    const trashed = await s.caller.entries.list({ trash: true });
    expect(live.items.map((e) => e.id)).toEqual([a.id]);
    expect(trashed.items.map((e) => e.id)).toEqual([b.id]);
  });

  test('restore puts the entry back in the active list', async () => {
    const created = await s.caller.entries.create({ body: 'oops' });
    await s.caller.entries.delete({ id: created.id });
    const restored = await s.caller.entries.restore({ id: created.id });
    expect(restored.deletedAt).toBeNull();
    const { items } = await s.caller.entries.list();
    expect(items.map((e) => e.id)).toEqual([created.id]);
  });

  test('delete is idempotent on already-deleted entry', async () => {
    const created = await s.caller.entries.create({ body: 'x' });
    const first = await s.caller.entries.delete({ id: created.id });
    const second = await s.caller.entries.delete({ id: created.id });
    expect(second.deletedAt).toBe(first.deletedAt);
  });

  test('restore is a no-op on already-active entry', async () => {
    const created = await s.caller.entries.create({ body: 'x' });
    const result = await s.caller.entries.restore({ id: created.id });
    expect(result.deletedAt).toBeNull();
  });

  test('delete + restore both throw NOT_FOUND for missing id', async () => {
    await expect(s.caller.entries.delete({ id: 'nope' })).rejects.toThrow();
    await expect(s.caller.entries.restore({ id: 'nope' })).rejects.toThrow();
  });

  test('deleted entries keep their tag links (so restore brings them back)', async () => {
    const db = drizzle(s.raw, { schema });
    const created = await s.caller.entries.create({ body: '#kept-tag here' });
    const linksBefore = db.select().from(entryTags).where(eq(entryTags.entryId, created.id)).all();
    expect(linksBefore).toHaveLength(1);
    await s.caller.entries.delete({ id: created.id });
    const linksAfter = db.select().from(entryTags).where(eq(entryTags.entryId, created.id)).all();
    expect(linksAfter).toHaveLength(1);
  });
});

describe('entries.search', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  test('returns body matches with attached tag links', async () => {
    await s.caller.entries.create({ body: 'shipping the launch with @priya' });
    await s.caller.entries.create({ body: 'rolling back the migration' });

    const hits = await s.caller.entries.search({ q: 'launch' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.body).toContain('launch');
    expect(hits[0]?.tags.map((t) => t.tag.name)).toContain('priya');
  });

  test('prefix-matches the last alnum token', async () => {
    await s.caller.entries.create({ body: 'production rollout incoming' });
    await s.caller.entries.create({ body: 'staging tests passing' });

    const hits = await s.caller.entries.search({ q: 'roll' });
    expect(hits.map((h) => h.body)).toEqual(['production rollout incoming']);
  });

  test('hyphenated tag tokens (e.g. q3-plan) match via body_rendered', async () => {
    await s.caller.entries.create({ body: 'sync about #q3-plan with @priya' });
    await s.caller.entries.create({ body: 'unrelated note' });

    const hits = await s.caller.entries.search({ q: 'q3-plan' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.bodyRendered).toContain('q3-plan');
  });

  test('strips leading sigils so #q3 still matches', async () => {
    await s.caller.entries.create({ body: 'about #q3-plan' });
    const hits = await s.caller.entries.search({ q: '#q3' });
    expect(hits).toHaveLength(1);
  });

  test('excludes soft-deleted entries', async () => {
    const a = await s.caller.entries.create({ body: 'launch announcement' });
    await s.caller.entries.delete({ id: a.id });

    const hits = await s.caller.entries.search({ q: 'launch' });
    expect(hits).toHaveLength(0);
  });

  test('reflects edits after entries.update (FTS triggers fire)', async () => {
    const created = await s.caller.entries.create({ body: 'first body about apples' });
    let hits = await s.caller.entries.search({ q: 'apples' });
    expect(hits).toHaveLength(1);

    await s.caller.entries.update({ id: created.id, body: 'rewritten about oranges' });

    hits = await s.caller.entries.search({ q: 'apples' });
    expect(hits).toHaveLength(0);
    hits = await s.caller.entries.search({ q: 'oranges' });
    expect(hits).toHaveLength(1);
  });

  test('rejects empty / oversized q', async () => {
    await expect(s.caller.entries.search({ q: '' })).rejects.toThrow();
    await expect(s.caller.entries.search({ q: 'x'.repeat(201) })).rejects.toThrow();
  });

  test('returns empty for query with no extractable tokens', async () => {
    await s.caller.entries.create({ body: 'something' });
    const hits = await s.caller.entries.search({ q: '!!!' });
    expect(hits).toEqual([]);
  });
});

describe('entries + attachments reconciliation', () => {
  let raw: Database;
  let dir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jott-entry-att-'));
    raw = new Database(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    migrate(raw);
    const db = drizzle(raw, { schema });
    caller = createCaller({
      db,
      raw,
      dbPath: ':memory:',
      attachmentsDir: dir,
      claude: { available: false, binaryPath: null, version: null },
    });
  });
  afterEach(() => {
    raw.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function seedOrphan(id: string): void {
    writeAttachment(dir, id, 'png', new Uint8Array([1, 2, 3]));
    raw.run(
      "INSERT INTO attachments (id, entry_id, kind, filename, mime, bytes, created_at) VALUES (?, NULL, 'image', ?, 'image/png', 3, ?)",
      [id, `${id}.png`, Date.now()],
    );
  }

  test('create binds referenced orphan attachments to the new entry', async () => {
    const aid = ulid();
    seedOrphan(aid);
    const entry = await caller.entries.create({
      body: `look ![](/api/attachments/${aid})`,
    });
    const db = drizzle(raw, { schema });
    const row = db.select().from(attachments).all()[0];
    expect(row?.entryId).toBe(entry.id);
  });

  test('update removing an image deletes its row + file', async () => {
    const aid = ulid();
    seedOrphan(aid);
    const entry = await caller.entries.create({
      body: `keep ![](/api/attachments/${aid})`,
    });
    expect(existsSync(join(dir, `${aid}.png`))).toBe(true);
    await caller.entries.update({ id: entry.id, body: 'keep' });
    const db = drizzle(raw, { schema });
    expect(db.select().from(attachments).all()).toHaveLength(0);
    expect(existsSync(join(dir, `${aid}.png`))).toBe(false);
  });
});

describe('entries.list filters', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });

  async function createAt(body: string, createdAt: number): Promise<{ id: string }> {
    const created = await s.caller.entries.create({ body });
    s.raw.run('UPDATE entries SET created_at = ? WHERE id = ?', [createdAt, created.id]);
    return { id: created.id };
  }

  test('tagId filter returns only entries linked to that tag', async () => {
    await s.caller.entries.create({ body: 'about #work today' });
    await s.caller.entries.create({ body: 'about #play tonight' });
    const work = (await s.caller.tags.list()).find((t) => t.name === 'work');
    if (!work) throw new Error('unreachable');

    const hits = await s.caller.entries.list({ tagId: work.id });
    expect(hits.items).toHaveLength(1);
    expect(hits.items[0]?.bodyRendered).toContain('#work');
  });

  test('tagId returns empty when no entries link to the tag', async () => {
    const hits = await s.caller.entries.list({ tagId: 'nope' });
    expect(hits.items).toEqual([]);
    expect(hits.nextCursor).toBeNull();
  });

  test('from + to bound the createdAt window inclusively', async () => {
    await createAt('first', 1_000);
    await createAt('second', 2_000);
    await createAt('third', 3_000);

    const middle = await s.caller.entries.list({ from: 2_000, to: 2_000 });
    expect(middle.items.map((e) => e.body)).toEqual(['second']);

    const lowerOpen = await s.caller.entries.list({ to: 2_000 });
    expect(lowerOpen.items.map((e) => e.body).sort()).toEqual(['first', 'second']);

    const upperOpen = await s.caller.entries.list({ from: 2_000 });
    expect(upperOpen.items.map((e) => e.body).sort()).toEqual(['second', 'third']);
  });

  test('combines tagId + date range as AND', async () => {
    const a = await createAt('about #work yesterday', 1_000);
    await createAt('about #work today', 3_000);
    await createAt('about #play yesterday', 1_000);
    const work = (await s.caller.tags.list()).find((t) => t.name === 'work');
    if (!work) throw new Error('unreachable');

    const hits = await s.caller.entries.list({ tagId: work.id, from: 500, to: 1_500 });
    expect(hits.items.map((e) => e.id)).toEqual([a.id]);
  });

  test('filters do not bleed into trash mode', async () => {
    const a = await s.caller.entries.create({ body: 'about #work' });
    await s.caller.entries.delete({ id: a.id });
    const work = (await s.caller.tags.list()).find((t) => t.name === 'work');
    if (!work) throw new Error('unreachable');

    const live = await s.caller.entries.list({ tagId: work.id });
    expect(live.items).toEqual([]);
    const trashed = await s.caller.entries.list({ trash: true, tagId: work.id });
    expect(trashed.items.map((e) => e.id)).toEqual([a.id]);
  });
});
