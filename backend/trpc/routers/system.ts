import { dirname } from 'node:path';
import { VERSION } from '@shared/version';
import { count, isNotNull, isNull } from 'drizzle-orm';
import { entries, tags } from '../../db/schema';
import { publicProcedure, router } from '../trpc';

export type SystemInfo = {
  version: string;
  dataDir: string;
  bundled: boolean;
  tagCount: number;
  entryCount: number;
  deletedEntryCount: number;
};

export const systemRouter = router({
  info: publicProcedure.query(({ ctx }): SystemInfo => {
    const tagCount = ctx.db.select({ c: count() }).from(tags).get()?.c ?? 0;
    const entryCount =
      ctx.db.select({ c: count() }).from(entries).where(isNull(entries.deletedAt)).get()?.c ?? 0;
    const deletedEntryCount =
      ctx.db.select({ c: count() }).from(entries).where(isNotNull(entries.deletedAt)).get()?.c ?? 0;
    return {
      version: VERSION,
      dataDir: dirname(ctx.dbPath),
      bundled: process.env.JOTT_BUNDLED === 'true',
      tagCount,
      entryCount,
      deletedEntryCount,
    };
  }),
});
