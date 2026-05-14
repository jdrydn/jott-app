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

  return { from, to: current, applied: current - from };
}

function readUserVersion(db: Database): number {
  const row = db.query('PRAGMA user_version').get() as { user_version: number } | null;
  return row?.user_version ?? 0;
}
