import { Database } from 'bun:sqlite';
import { mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from './migrate';
import * as schema from './schema';

export type Db = BunSQLiteDatabase<typeof schema>;

export type DbHandle = {
  db: Db;
  raw: Database;
  close: () => void;
};

export function openDb(path: string): DbHandle {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const raw = new Database(path, { create: true });
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return {
    db,
    raw,
    close: () => raw.close(),
  };
}

// Removes the SQLite file and its WAL/SHM sidecars. Caller is responsible for
// closing any open handles first. ENOENT is treated as a no-op so calling
// against a non-existent path is safe.
export function clearDbFiles(path: string): { deleted: string[] } {
  const deleted: string[] = [];
  if (path === ':memory:') return { deleted };
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${path}${suffix}`;
    try {
      unlinkSync(target);
      deleted.push(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return { deleted };
}
