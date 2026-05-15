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

  test('creates tags + entry_tags tables', () => {
    const db = new Database(':memory:');
    migrate(db);
    const names = (
      db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(names).toContain('tags');
    expect(names).toContain('entry_tags');
  });

  test('tags table has expected columns', () => {
    const db = new Database(':memory:');
    migrate(db);
    const cols = db.query("PRAGMA table_info('tags')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.get('id')).toMatchObject({ type: 'TEXT', notnull: 1, pk: 1 });
    expect(byName.get('type')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('name')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('initials')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('color')).toMatchObject({ type: 'TEXT', notnull: 1 });
    expect(byName.get('created_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.get('updated_at')).toMatchObject({ type: 'INTEGER', notnull: 1 });
  });

  test('tags type CHECK constraint rejects invalid values', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(() =>
      db.exec(
        `INSERT INTO tags (id, type, name, initials, color, created_at, updated_at)
         VALUES ('t1', 'bogus', 'x', 'X', '#000', 1, 1)`,
      ),
    ).toThrow();
  });

  test('tags (type, name) is unique', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.exec(
      `INSERT INTO tags (id, type, name, initials, color, created_at, updated_at)
       VALUES ('t1', 'topic', 'work', 'WO', '#000', 1, 1)`,
    );
    expect(() =>
      db.exec(
        `INSERT INTO tags (id, type, name, initials, color, created_at, updated_at)
         VALUES ('t2', 'topic', 'work', 'WO', '#000', 2, 2)`,
      ),
    ).toThrow();
    db.exec(
      `INSERT INTO tags (id, type, name, initials, color, created_at, updated_at)
       VALUES ('t3', 'user', 'work', 'WO', '#000', 3, 3)`,
    );
  });

  test('entry_tags cascades on entry delete and on tag delete', () => {
    const db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    db.exec(
      `INSERT INTO entries (id, created_at, updated_at, body) VALUES ('e1', 1, 1, 'hi #work')`,
    );
    db.exec(
      `INSERT INTO tags (id, type, name, initials, color, created_at, updated_at)
       VALUES ('t1', 'topic', 'work', 'WO', '#000', 1, 1)`,
    );
    db.exec(
      `INSERT INTO entry_tags (entry_id, tag_id, name_when_linked, created_at)
       VALUES ('e1', 't1', 'work', 1)`,
    );
    db.exec(`DELETE FROM tags WHERE id = 't1'`);
    const after = db.query('SELECT COUNT(*) AS n FROM entry_tags').get() as { n: number };
    expect(after.n).toBe(0);

    db.exec(
      `INSERT INTO tags (id, type, name, initials, color, created_at, updated_at)
       VALUES ('t2', 'topic', 'work', 'WO', '#000', 1, 1)`,
    );
    db.exec(
      `INSERT INTO entry_tags (entry_id, tag_id, name_when_linked, created_at)
       VALUES ('e1', 't2', 'work', 1)`,
    );
    db.exec(`DELETE FROM entries WHERE id = 'e1'`);
    const after2 = db.query('SELECT COUNT(*) AS n FROM entry_tags').get() as { n: number };
    expect(after2.n).toBe(0);
  });

  test('creates entries_fts virtual table', () => {
    const db = new Database(':memory:');
    migrate(db);
    const row = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='entries_fts'")
      .get();
    expect(row).toEqual({ name: 'entries_fts' });
  });

  test('FTS triggers fire on insert/update/delete', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.exec(
      `INSERT INTO entries (id, created_at, updated_at, body) VALUES ('e1', 1, 1, 'shipping the launch')`,
    );
    let rows = db
      .query("SELECT body FROM entries_fts WHERE entries_fts MATCH 'launch'")
      .all() as Array<{ body: string }>;
    expect(rows).toHaveLength(1);

    db.exec(`UPDATE entries SET body = 'rolling back' WHERE id = 'e1'`);
    rows = db
      .query("SELECT body FROM entries_fts WHERE entries_fts MATCH 'launch'")
      .all() as Array<{ body: string }>;
    expect(rows).toHaveLength(0);
    rows = db
      .query("SELECT body FROM entries_fts WHERE entries_fts MATCH 'rolling'")
      .all() as Array<{ body: string }>;
    expect(rows).toHaveLength(1);

    db.exec(`DELETE FROM entries WHERE id = 'e1'`);
    rows = db
      .query("SELECT body FROM entries_fts WHERE entries_fts MATCH 'rolling'")
      .all() as Array<{ body: string }>;
    expect(rows).toHaveLength(0);
  });

  test('FTS index is backfilled from existing rows', () => {
    const db = new Database(':memory:');
    // Apply only the first two migrations manually so we can seed before FTS is added.
    db.exec(migrations[0] as string);
    db.exec('PRAGMA user_version = 1');
    db.exec(migrations[1] as string);
    db.exec('PRAGMA user_version = 2');
    db.exec(
      `INSERT INTO entries (id, created_at, updated_at, body) VALUES ('legacy', 1, 1, 'preexisting note about migrations')`,
    );

    // Now apply the FTS migration.
    migrate(db);

    const rows = db
      .query(
        "SELECT entries.id FROM entries_fts JOIN entries ON entries.rowid = entries_fts.rowid WHERE entries_fts MATCH 'preexisting'",
      )
      .all() as Array<{ id: string }>;
    expect(rows).toEqual([{ id: 'legacy' }]);
  });

  test('creates profile table with id CHECK constraint', () => {
    const db = new Database(':memory:');
    migrate(db);
    const row = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='profile'")
      .get();
    expect(row).toEqual({ name: 'profile' });

    expect(() =>
      db.exec(
        `INSERT INTO profile (id, name, theme, created_at) VALUES ('them', 'X', 'system', 1)`,
      ),
    ).toThrow();
    db.exec(`INSERT INTO profile (id, name, theme, created_at) VALUES ('me', 'Me', 'system', 1)`);
  });

  test('profile theme CHECK rejects invalid values', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(() =>
      db.exec(`INSERT INTO profile (id, name, theme, created_at) VALUES ('me', 'X', 'sepia', 1)`),
    ).toThrow();
  });

  test('creates settings key/value table', () => {
    const db = new Database(':memory:');
    migrate(db);
    const row = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get();
    expect(row).toEqual({ name: 'settings' });

    db.exec(`INSERT INTO settings (key, value, updated_at) VALUES ('claude.binary', 'claude', 1)`);
    expect(() =>
      db.exec(`INSERT INTO settings (key, value, updated_at) VALUES ('claude.binary', 'other', 2)`),
    ).toThrow();
  });
});
