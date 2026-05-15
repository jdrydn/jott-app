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
  return createCaller({ db, dbPath });
}

describe('system.info', () => {
  test('returns version + dbPath from context', async () => {
    const caller = setup('/tmp/jott.db');
    const info = await caller.system.info();
    expect(info.version).toBe(VERSION);
    expect(info.dbPath).toBe('/tmp/jott.db');
  });
});
