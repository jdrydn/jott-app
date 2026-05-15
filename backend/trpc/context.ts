import type { Db } from '../db/client';

export type Context = {
  db: Db;
  dbPath: string;
};

export type ContextDeps = {
  db: Db;
  dbPath: string;
};

export function makeCreateContext(deps: ContextDeps): () => Context {
  return () => ({ db: deps.db, dbPath: deps.dbPath });
}
