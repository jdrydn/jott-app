import { join } from 'node:path';
import { VERSION } from '@shared/version';
import { detectClaude } from './ai/claude';
import { defaultAttachmentsDir, sweepOrphanAttachments } from './data/attachments';
import { openDb } from './db/client';
import { seedDemoData } from './db/seed';
import { createApp } from './server';

const dataDir = process.env.JOTT_DATA_DIR ?? join(process.cwd(), '.jott-dev');
const dbPath = join(dataDir, 'jottapp.db');

const dbHandle = openDb(dbPath);

if (process.env.JOTT_SEED_DB === '1') {
  const existing = dbHandle.raw.query('SELECT COUNT(*) as n FROM entries').get() as { n: number };
  if (existing.n === 0) {
    const seeded = seedDemoData(dbHandle.db);
    process.stdout.write(`seeded ${seeded} demo entries\n`);
  }
}

const attachmentsDir = defaultAttachmentsDir(dbPath);
const sweptOrphans = sweepOrphanAttachments(dbHandle.raw, attachmentsDir);
if (sweptOrphans > 0) {
  process.stdout.write(`cleaned ${sweptOrphans} orphan attachment(s)\n`);
}

const claude = detectClaude();
const app = createApp({
  db: dbHandle.db,
  raw: dbHandle.raw,
  dbPath,
  attachmentsDir,
  claude,
});

process.stdout.write(`jottapp v${VERSION} (dev) — db: ${dbPath}\n`);

export default app;
