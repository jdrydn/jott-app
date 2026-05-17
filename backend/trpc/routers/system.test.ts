import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { VERSION } from '@shared/version';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from '../../db/migrate';
import * as schema from '../../db/schema';
import { appRouter } from '../router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(appRouter);

function setup(dbPath: string) {
  const raw = new Database(':memory:');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return createCaller({
    db,
    raw,
    dbPath,
    attachmentsDir: '/tmp/jottapp-test-attachments',
    claude: { available: false, binaryPath: null, version: null },
  });
}

describe('system.info', () => {
  test('returns version + dataDir derived from context', async () => {
    const caller = setup('/tmp/jott/jottapp.db');
    const info = await caller.system.info();
    expect(info.version).toBe(VERSION);
    expect(info.dataDir).toBe('/tmp/jott');
    expect(info.bundled).toBe(false);
  });

  test('reports bundled=true when JOTT_BUNDLED env is set', async () => {
    const prev = process.env.JOTT_BUNDLED;
    process.env.JOTT_BUNDLED = 'true';
    try {
      const caller = setup('/tmp/jott/jottapp.db');
      const info = await caller.system.info();
      expect(info.bundled).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.JOTT_BUNDLED;
      else process.env.JOTT_BUNDLED = prev;
    }
  });
});
