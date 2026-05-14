import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './client';

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
