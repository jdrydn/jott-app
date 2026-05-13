import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { migrate } from './migrate';
import { migrations } from './migrations';

describe('migrate', () => {
  test('fresh DB applies all migrations', () => {
    const db = new Database(':memory:');
    const result = migrate(db);
    expect(result.from).toBe(0);
    expect(result.to).toBe(migrations.length);
    expect(result.applied).toBe(migrations.length);
  });

  test('user_version is set after migration', () => {
    const db = new Database(':memory:');
    migrate(db);
    const row = db.query('PRAGMA user_version').get() as { user_version: number };
    expect(row.user_version).toBe(migrations.length);
  });

  test('second run is a no-op', () => {
    const db = new Database(':memory:');
    const first = migrate(db);
    const second = migrate(db);
    expect(second.from).toBe(first.to);
    expect(second.to).toBe(first.to);
    expect(second.applied).toBe(0);
  });

  test('creates entries table', () => {
    const db = new Database(':memory:');
    migrate(db);
    const row = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'")
      .get();
    expect(row).toEqual({ name: 'entries' });
  });

  test('entries table has expected columns + types', () => {
    const db = new Database(':memory:');
    migrate(db);
    const cols = db.query("PRAGMA table_info('entries')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.get('id')).toMatchObject({ type: 'TEXT', notnull: 1, pk: 1 });
    expect(byName.get('created_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('updated_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('body')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('deleted_at')).toMatchObject({ type: 'INTEGER', notnull: 0 });
  });

  test('creates created_at index', () => {
    const db = new Database(':memory:');
    migrate(db);
    const row = db
      .query("SELECT name FROM sqlite_master WHERE type='index' AND name='entries_created_at_idx'")
      .get();
    expect(row).toEqual({ name: 'entries_created_at_idx' });
  });

  test('rolls back on failure (atomic per-migration)', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE entries (broken TEXT)');
    expect(() => migrate(db)).toThrow();
    const row = db.query('PRAGMA user_version').get() as { user_version: number };
    expect(row.user_version).toBe(0);
  });
});
