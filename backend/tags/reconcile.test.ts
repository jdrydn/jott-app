import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { ulid } from 'ulid';
import { extractTagRefs } from '../../shared/tags';
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
  db.insert(entries)
    .values({ id: entryId, body, bodyRendered: body, createdAt: 1000, updatedAt: 1000 })
    .run();
  return { db, raw, entryId };
}

describe('reconcileEntryTags', () => {
  let s: Setup;

  test('creates new tags and rewrites bare tokens to ULID markers', () => {
    s = setup('@priya on #q3-plan');
    const r = reconcileEntryTags(s.db, s.entryId, '@priya on #q3-plan', 1000);
    expect(r.linked).toBe(2);
    expect(r.unlinked).toBe(0);
    expect(r.tagsCreated).toBe(2);

    const allTags = s.db.select().from(tags).all();
    expect(allTags.map((t) => `${t.type}:${t.name}`).sort()).toEqual([
      'topic:q3-plan',
      'user:priya',
    ]);

    // Body now stores ULID markers, not the literal tokens.
    const refIds = extractTagRefs(r.body);
    expect(refIds).toHaveLength(2);
    expect(r.body).not.toContain('@priya');
    expect(r.body).not.toContain('#q3-plan');

    // Rendered form resolves back to readable text for FTS.
    expect(r.bodyRendered).toContain('@priya');
    expect(r.bodyRendered).toContain('#q3-plan');

    const links = s.db.select().from(entryTags).where(eq(entryTags.entryId, s.entryId)).all();
    expect(links).toHaveLength(2);
  });

  test('reuses existing tags by (type, name)', () => {
    s = setup('first #work');
    reconcileEntryTags(s.db, s.entryId, 'first #work', 1000);
    const tagsBefore = s.db.select().from(tags).all();

    const second = ulid();
    s.db
      .insert(entries)
      .values({
        id: second,
        body: '#work again',
        bodyRendered: '#work again',
        createdAt: 2000,
        updatedAt: 2000,
      })
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

  test('case-insensitive: #Work and #WORK both map to the single canonical tag', () => {
    s = setup('hi #Work and #WORK');
    const r = reconcileEntryTags(s.db, s.entryId, 'hi #Work and #WORK', 1000);
    const allTags = s.db.select().from(tags).all();
    expect(allTags).toHaveLength(1);
    expect(allTags[0]?.name).toBe('work');
    // Both bare tokens rewritten to the same marker.
    expect(extractTagRefs(r.body)).toHaveLength(2);
  });

  test('idempotent — running twice on the same body is a no-op', () => {
    s = setup('@anna #onboarding');
    const first = reconcileEntryTags(s.db, s.entryId, '@anna #onboarding', 1000);
    // Second call passes the already-rewritten body (canonical markers).
    const r = reconcileEntryTags(s.db, s.entryId, first.body, 2000);
    expect(r.linked).toBe(0);
    expect(r.unlinked).toBe(0);
    expect(r.tagsCreated).toBe(0);
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

  test('marker-only body passes through unchanged on a second call', () => {
    s = setup('@priya about #plan');
    const first = reconcileEntryTags(s.db, s.entryId, '@priya about #plan', 1000);
    const refIds = extractTagRefs(first.body);
    expect(refIds).toHaveLength(2);

    const second = reconcileEntryTags(s.db, s.entryId, first.body, 2000);
    expect(second.body).toBe(first.body);
    expect(second.bodyRendered).toBe(first.bodyRendered);
  });

  beforeEach(() => {
    /* re-bind in each test via setup() */
  });
});
