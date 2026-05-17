import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearDbFiles, openDb } from './client';

describe('openDb', () => {
  test('opens, migrates, persists on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jottapp-test-'));
    const path = join(dir, 'nested', 'test.db');
    try {
      const { raw, close } = openDb(path);
      const row = raw
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'")
        .get();
      expect(row).toEqual({ name: 'entries' });
      close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('clearDbFiles removes the db + WAL/SHM sidecars', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jottapp-test-'));
    const path = join(dir, 'doomed.db');
    try {
      // openDb in WAL mode produces sidecars after the first write.
      const { raw, close } = openDb(path);
      raw.run('INSERT INTO entries (id, created_at, updated_at, body) VALUES (?, ?, ?, ?)', [
        'x',
        1,
        1,
        'hi',
      ]);
      close();
      expect(existsSync(path)).toBe(true);

      const { deleted } = clearDbFiles(path);
      expect(deleted).toContain(path);
      expect(existsSync(path)).toBe(false);
      expect(existsSync(`${path}-wal`)).toBe(false);
      expect(existsSync(`${path}-shm`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('clearDbFiles is a no-op on a missing path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jottapp-test-'));
    try {
      const { deleted } = clearDbFiles(join(dir, 'never-existed.db'));
      expect(deleted).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('clearDbFiles handles a db that has no sidecars yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jottapp-test-'));
    const path = join(dir, 'no-sidecars.db');
    try {
      writeFileSync(path, '');
      const { deleted } = clearDbFiles(path);
      expect(deleted).toEqual([path]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('clearDbFiles is a no-op for :memory:', () => {
    expect(clearDbFiles(':memory:')).toEqual({ deleted: [] });
  });

  test('reopens an existing DB without re-running migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jottapp-test-'));
    const path = join(dir, 'reopen.db');
    try {
      const first = openDb(path);
      first.raw.run('INSERT INTO entries (id, created_at, updated_at, body) VALUES (?, ?, ?, ?)', [
        'abc',
        1,
        1,
        'hello',
      ]);
      first.close();

      const second = openDb(path);
      const row = second.raw.query('SELECT id, body FROM entries WHERE id = ?').get('abc') as {
        id: string;
        body: string;
      } | null;
      expect(row).toEqual({ id: 'abc', body: 'hello' });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
