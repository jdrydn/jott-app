import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { Db } from '../db/client';
import { migrate } from '../db/migrate';
import * as schema from '../db/schema';
import { entries, entryTags, tags } from '../db/schema';
import { ENTRY_CAP, fetchEntrySlice } from './entrySlice';

let db: Db;
let raw: Database;

beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  db = drizzle(raw, { schema });
});

function seed(rows: Array<{ id: string; createdAt: number; body?: string; deletedAt?: number }>) {
  for (const r of rows) {
    db.insert(entries)
      .values({
        id: r.id,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
        body: r.body ?? `body of ${r.id}`,
        deletedAt: r.deletedAt ?? null,
      })
      .run();
  }
}

describe('fetchEntrySlice', () => {
  test('returns empty when no entries match', () => {
    expect(fetchEntrySlice(db, {})).toEqual([]);
  });

  test('orders results chronologically (oldest-first)', () => {
    seed([
      { id: 'a', createdAt: 100 },
      { id: 'c', createdAt: 300 },
      { id: 'b', createdAt: 200 },
    ]);
    const result = fetchEntrySlice(db, {});
    expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('honours from/to bounds', () => {
    seed([
      { id: 'a', createdAt: 100 },
      { id: 'b', createdAt: 200 },
      { id: 'c', createdAt: 300 },
      { id: 'd', createdAt: 400 },
    ]);
    expect(fetchEntrySlice(db, { from: 200, to: 300 }).map((e) => e.id)).toEqual(['b', 'c']);
    expect(fetchEntrySlice(db, { from: 250 }).map((e) => e.id)).toEqual(['c', 'd']);
    expect(fetchEntrySlice(db, { to: 200 }).map((e) => e.id)).toEqual(['a', 'b']);
  });

  test('omits soft-deleted entries', () => {
    seed([
      { id: 'live', createdAt: 100 },
      { id: 'dead', createdAt: 200, deletedAt: 999 },
    ]);
    expect(fetchEntrySlice(db, {}).map((e) => e.id)).toEqual(['live']);
  });

  test('filters by tagId, returning only linked entries', () => {
    seed([
      { id: 'a', createdAt: 100 },
      { id: 'b', createdAt: 200 },
      { id: 'c', createdAt: 300 },
    ]);
    db.insert(tags)
      .values({
        id: 'tag1',
        type: 'topic',
        name: 'work',
        initials: 'WO',
        color: '#000',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(entryTags)
      .values([
        { entryId: 'a', tagId: 'tag1', createdAt: 1 },
        { entryId: 'c', tagId: 'tag1', createdAt: 1 },
      ])
      .run();
    expect(fetchEntrySlice(db, { tagId: 'tag1' }).map((e) => e.id)).toEqual(['a', 'c']);
    expect(fetchEntrySlice(db, { tagId: 'unknown-tag' })).toEqual([]);
  });

  test('caps at ENTRY_CAP, keeping the most-recent window', () => {
    seed(
      Array.from({ length: ENTRY_CAP + 50 }, (_, i) => ({
        id: `e${i.toString().padStart(3, '0')}`,
        createdAt: 1000 + i,
      })),
    );
    const result = fetchEntrySlice(db, {});
    expect(result).toHaveLength(ENTRY_CAP);
    // Oldest of the capped slice is entry index 50 (we kept the newest 100).
    expect(result[0]?.id).toBe('e050');
    expect(result[result.length - 1]?.id).toBe(`e${(ENTRY_CAP + 49).toString().padStart(3, '0')}`);
  });
});
