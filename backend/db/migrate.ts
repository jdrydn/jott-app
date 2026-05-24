import type { Database } from 'bun:sqlite';
import { migrations } from './migrations';

export type MigrateResult = {
  from: number;
  to: number;
  applied: number;
};

export function migrate(db: Database): MigrateResult {
  const from = readUserVersion(db);
  let current = from;

  // `PRAGMA foreign_keys` is a no-op inside a transaction, so we toggle it
  // around the whole batch. Some migrations recreate tables that are FK
  // targets (the canonical SQLite "drop-and-rename" pattern); with FKs on,
  // the DROP cascades and wipes referencing rows. After the batch we run
  // `foreign_key_check` to surface any orphans the schema change introduced.
  const fkWasOn = readForeignKeys(db);
  if (fkWasOn) db.exec('PRAGMA foreign_keys = OFF');

  let violations: unknown[] = [];
  try {
    for (let i = current; i < migrations.length; i++) {
      const sql = migrations[i];
      if (!sql) continue;
      const target = i + 1;
      db.transaction(() => {
        db.exec(sql);
        db.exec(`PRAGMA user_version = ${target}`);
      })();
      current = target;
    }
    if (fkWasOn) violations = db.query('PRAGMA foreign_key_check').all();
  } finally {
    if (fkWasOn) db.exec('PRAGMA foreign_keys = ON');
  }

  if (violations.length > 0) {
    throw new Error(`migration left foreign key violations: ${JSON.stringify(violations)}`);
  }

  return { from, to: current, applied: current - from };
}

function readUserVersion(db: Database): number {
  const row = db.query('PRAGMA user_version').get() as { user_version: number } | null;
  return row?.user_version ?? 0;
}

function readForeignKeys(db: Database): boolean {
  const row = db.query('PRAGMA foreign_keys').get() as { foreign_keys: number } | null;
  return (row?.foreign_keys ?? 0) === 1;
}
