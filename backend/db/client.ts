import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
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
