import type { ClaudeDetection } from '../ai/claude';
import type { Db } from '../db/client';

export type Context = {
  db: Db;
  dbPath: string;
  claude: ClaudeDetection;
};

export type ContextDeps = {
  db: Db;
  dbPath: string;
  claude: ClaudeDetection;
};

export function makeCreateContext(deps: ContextDeps): () => Context {
  return () => ({ db: deps.db, dbPath: deps.dbPath, claude: deps.claude });
}
