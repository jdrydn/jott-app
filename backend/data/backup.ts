import type { Database } from 'bun:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type BackupOnQuitSettings = {
  enabled: boolean;
  dir: string;
};

export function readBackupOnQuitSettings(raw: Database): BackupOnQuitSettings {
  const rows = raw
    .query("SELECT key, value FROM settings WHERE key IN ('backup.onQuit', 'backup.dir')")
    .all() as Array<{ key: string; value: string }>;
  const enabled = rows.find((r) => r.key === 'backup.onQuit')?.value === 'true';
  const dir = rows.find((r) => r.key === 'backup.dir')?.value ?? '';
  return { enabled, dir };
}

export function defaultBackupDir(dbPath: string): string {
  return join(dirname(dbPath), 'backups');
}

export function backupFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `jottapp-${y}${m}${d}-${hh}${mm}${ss}.db`;
}

export type BackupResult = {
  path: string;
  bytes: number;
};

export class BackupNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupNotSupportedError';
  }
}

export type BackupOptions = {
  dir?: string;
  now?: Date;
};

export function backupDb(raw: Database, dbPath: string, opts: BackupOptions = {}): BackupResult {
  if (dbPath === ':memory:') {
    throw new BackupNotSupportedError('cannot back up an in-memory database');
  }
  const dir = opts.dir?.trim() ? opts.dir.trim() : defaultBackupDir(dbPath);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, backupFilename(opts.now));
  // VACUUM INTO takes a SQL string literal; double up any single quote in the path.
  const escaped = path.replaceAll("'", "''");
  raw.exec(`VACUUM INTO '${escaped}'`);
  const bytes = statSync(path).size;
  return { path, bytes };
}
