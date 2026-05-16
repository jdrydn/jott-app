import type { Database } from 'bun:sqlite';
import type { ClaudeDetection } from '../ai/claude';
import type { Db } from '../db/client';

export type Context = {
  db: Db;
  raw: Database;
  dbPath: string;
  attachmentsDir: string;
  claude: ClaudeDetection;
};

export type ContextDeps = {
  db: Db;
  raw: Database;
  dbPath: string;
  attachmentsDir: string;
  claude: ClaudeDetection;
};

export function makeCreateContext(deps: ContextDeps): () => Context {
  return () => ({
    db: deps.db,
    raw: deps.raw,
    dbPath: deps.dbPath,
    attachmentsDir: deps.attachmentsDir,
    claude: deps.claude,
  });
}
