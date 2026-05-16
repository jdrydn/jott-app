import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../db/migrate';
import {
  BackupNotSupportedError,
  backupDb,
  backupFilename,
  defaultBackupDir,
  readBackupOnQuitSettings,
} from './backup';

describe('backupFilename', () => {
  test('formats as jottapp-YYYYMMDD-HHMMSS.db', () => {
    const d = new Date('2026-05-16T09:30:05.123Z');
    // Use UTC-aware components to keep this assertion deterministic.
    const expected = `jottapp-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
      d.getHours(),
    )}${pad(d.getMinutes())}${pad(d.getSeconds())}.db`;
    expect(backupFilename(d)).toBe(expected);
  });
});

describe('defaultBackupDir', () => {
  test('places backups next to the db file', () => {
    expect(defaultBackupDir('/var/data/jottapp/jottapp.db')).toBe('/var/data/jottapp/backups');
  });
});

describe('backupDb', () => {
  let workdir: string;
  let dbPath: string;
  let raw: Database;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'jottapp-backup-'));
    dbPath = join(workdir, 'jottapp.db');
    raw = new Database(dbPath, { create: true });
    raw.exec('PRAGMA journal_mode = WAL');
    migrate(raw);
    raw.exec("INSERT INTO entries (id, created_at, updated_at, body) VALUES ('a', 1, 1, 'hi')");
  });

  afterEach(() => {
    raw.close();
    rmSync(workdir, { recursive: true, force: true });
  });

  test('writes a snapshot to the default dir', () => {
    const result = backupDb(raw, dbPath);
    expect(result.path).toContain(join(workdir, 'backups'));
    expect(existsSync(result.path)).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(statSync(result.path).size).toBe(result.bytes);
  });

  test('writes to a custom dir when given', () => {
    const custom = join(workdir, 'custom-backups');
    const result = backupDb(raw, dbPath, { dir: custom });
    expect(result.path.startsWith(custom)).toBe(true);
    expect(existsSync(result.path)).toBe(true);
  });

  test('snapshot is a queryable sqlite db containing the source rows', () => {
    const result = backupDb(raw, dbPath);
    const copy = new Database(result.path, { readonly: true });
    try {
      const row = copy.query("SELECT id, body FROM entries WHERE id = 'a'").get() as {
        id: string;
        body: string;
      } | null;
      expect(row).toEqual({ id: 'a', body: 'hi' });
    } finally {
      copy.close();
    }
  });

  test('refuses to back up :memory:', () => {
    const mem = new Database(':memory:');
    try {
      expect(() => backupDb(mem, ':memory:')).toThrow(BackupNotSupportedError);
    } finally {
      mem.close();
    }
  });
});

describe('readBackupOnQuitSettings', () => {
  let workdir: string;
  let raw: Database;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'jottapp-onquit-'));
    raw = new Database(join(workdir, 'jottapp.db'), { create: true });
    migrate(raw);
  });

  afterEach(() => {
    raw.close();
    rmSync(workdir, { recursive: true, force: true });
  });

  test('defaults to disabled and empty dir when no rows present', () => {
    expect(readBackupOnQuitSettings(raw)).toEqual({ enabled: false, dir: '' });
  });

  test('reads stored values', () => {
    const now = Date.now();
    raw.run("INSERT INTO settings (key, value, updated_at) VALUES ('backup.onQuit', 'true', ?)", [
      now,
    ]);
    raw.run("INSERT INTO settings (key, value, updated_at) VALUES ('backup.dir', '/tmp/x', ?)", [
      now,
    ]);
    expect(readBackupOnQuitSettings(raw)).toEqual({ enabled: true, dir: '/tmp/x' });
  });

  test('any value other than "true" counts as disabled', () => {
    const now = Date.now();
    raw.run("INSERT INTO settings (key, value, updated_at) VALUES ('backup.onQuit', 'false', ?)", [
      now,
    ]);
    expect(readBackupOnQuitSettings(raw).enabled).toBe(false);
  });
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
