import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { ulid } from 'ulid';
import type { Db } from '../db/client';
import { migrate } from '../db/migrate';
import * as schema from '../db/schema';
import { entries, entryTags, tags } from '../db/schema';
import { reconcileEntryTags } from './reconcile';

type Setup = { db: Db; raw: Database; entryId: string };

function setup(body: string): Setup {
  const raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  const entryId = ulid();
  db.insert(entries).values({ id: entryId, body, createdAt: 1000, updatedAt: 1000 }).run();
  return { db, raw, entryId };
}

describe('reconcileEntryTags', () => {
  let s: Setup;

  test('creates new tags and links them to the entry', () => {
    s = setup('@priya on #q3-plan');
    const r = reconcileEntryTags(s.db, s.entryId, '@priya on #q3-plan', 1000);
    expect(r).toEqual({ linked: 2, unlinked: 0, tagsCreated: 2 });

    const allTags = s.db.select().from(tags).all();
    expect(allTags.map((t) => `${t.type}:${t.name}`).sort()).toEqual([
      'topic:q3-plan',
      'user:priya',
    ]);

    const links = s.db.select().from(entryTags).where(eq(entryTags.entryId, s.entryId)).all();
    expect(links).toHaveLength(2);
    for (const l of links) {
      expect(l.nameWhenLinked).toMatch(/^(priya|q3-plan)$/);
      expect(l.createdAt).toBe(1000);
    }
  });

  test('reuses existing tags by (type, name)', () => {
    s = setup('first #work');
    reconcileEntryTags(s.db, s.entryId, 'first #work', 1000);
    const tagsBefore = s.db.select().from(tags).all();

    const second = ulid();
    s.db
      .insert(entries)
      .values({ id: second, body: '#work again', createdAt: 2000, updatedAt: 2000 })
      .run();
    const r = reconcileEntryTags(s.db, second, '#work again', 2000);
    expect(r.tagsCreated).toBe(0);

    const tagsAfter = s.db.select().from(tags).all();
    expect(tagsAfter).toHaveLength(tagsBefore.length);
  });

  test('removes stale links when body no longer references the tag', () => {
    s = setup('#work and #play');
    reconcileEntryTags(s.db, s.entryId, '#work and #play', 1000);
    expect(
      s.db.select().from(entryTags).where(eq(entryTags.entryId, s.entryId)).all(),
    ).toHaveLength(2);

    const r = reconcileEntryTags(s.db, s.entryId, 'just #work', 2000);
    expect(r.unlinked).toBe(1);
    const remaining = s.db.select().from(entryTags).where(eq(entryTags.entryId, s.entryId)).all();
    expect(remaining).toHaveLength(1);
    const workTag = s.db.select().from(tags).where(eq(tags.name, 'work')).get();
    expect(remaining[0]?.tagId).toBe(workTag?.id ?? '');
  });

  test('preserves first-seen literal in nameWhenLinked', () => {
    s = setup('hi #Work and #WORK');
    reconcileEntryTags(s.db, s.entryId, 'hi #Work and #WORK', 1000);
    const link = s.db.select().from(entryTags).where(eq(entryTags.entryId, s.entryId)).get();
    expect(link?.nameWhenLinked).toBe('Work');
  });

  test('idempotent — running twice on the same body is a no-op', () => {
    s = setup('@anna #onboarding');
    reconcileEntryTags(s.db, s.entryId, '@anna #onboarding', 1000);
    const r = reconcileEntryTags(s.db, s.entryId, '@anna #onboarding', 2000);
    expect(r).toEqual({ linked: 0, unlinked: 0, tagsCreated: 0 });
  });

  test('treats topic and user namespaces independently', () => {
    s = setup('@work and #work');
    reconcileEntryTags(s.db, s.entryId, '@work and #work', 1000);
    const allTags = s.db.select().from(tags).all();
    expect(allTags).toHaveLength(2);
    const types = new Set(allTags.map((t) => t.type));
    expect(types).toEqual(new Set(['topic', 'user']));
  });

  test('uses default initials and a palette colour for new tags', () => {
    s = setup('#design-review');
    reconcileEntryTags(s.db, s.entryId, '#design-review', 1000);
    const t = s.db.select().from(tags).where(eq(tags.name, 'design-review')).get();
    expect(t?.initials).toBe('DR');
    expect(t?.color).toMatch(/^#[0-9A-F]{6}$/);
  });

  beforeEach(() => {
    /* re-bind in each test via setup() */
  });
});
