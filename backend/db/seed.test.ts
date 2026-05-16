import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from './migrate';
import * as schema from './schema';
import { DEMO_ENTRY_COUNT, seedDemoData } from './seed';

function setup() {
  const raw = new Database(':memory:');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return { db, raw };
}

describe('seedDemoData', () => {
  test('inserts the fixture entry count', () => {
    const { db, raw } = setup();
    const inserted = seedDemoData(db);
    expect(inserted).toBe(DEMO_ENTRY_COUNT);
    const row = raw.query('SELECT COUNT(*) as n FROM entries').get() as { n: number };
    expect(row.n).toBe(DEMO_ENTRY_COUNT);
  });

  test('timestamps are relative to `now`', () => {
    const { db, raw } = setup();
    const now = new Date('2026-05-14T12:00:00');
    seedDemoData(db, now);
    const rows = raw.query('SELECT created_at FROM entries ORDER BY created_at').all() as {
      created_at: number;
    }[];
    const earliest = rows[0]?.created_at ?? 0;
    const latest = rows.at(-1)?.created_at ?? 0;
    expect(earliest).toBeGreaterThan(now.getTime() - 3 * 86_400_000);
    expect(latest).toBeLessThanOrEqual(now.getTime());
  });

  test('every fixture body contains at least one tag reference', () => {
    const { db, raw } = setup();
    seedDemoData(db);
    const rows = raw.query('SELECT body FROM entries').all() as { body: string }[];
    for (const r of rows) {
      // After reconcile, bare #/@ tokens are rewritten to ULID markers.
      expect(r.body).toMatch(/\{\{\s*tag\s+id=[0-9A-HJKMNP-TV-Z]{26}\s*\}\}/);
    }
  });

  test('multi-paragraph entries are present (for "Read full note" coverage)', () => {
    const { db, raw } = setup();
    seedDemoData(db);
    const rows = raw.query('SELECT body FROM entries').all() as { body: string }[];
    const multi = rows.filter((r) => /\n\n/.test(r.body));
    expect(multi.length).toBeGreaterThan(0);
  });
});
