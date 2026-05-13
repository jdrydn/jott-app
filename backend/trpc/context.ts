import type { Db } from '../db/client';

export type Context = {
  db: Db;
};

export type ContextDeps = {
  db: Db;
};

export function makeCreateContext(deps: ContextDeps): () => Context {
  return () => ({ db: deps.db });
}
