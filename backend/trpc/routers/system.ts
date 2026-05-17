import { dirname } from 'node:path';
import { VERSION } from '@shared/version';
import { publicProcedure, router } from '../trpc';

export type SystemInfo = {
  version: string;
  dataDir: string;
  dbPath: string;
  attachmentsDir: string;
};

export const systemRouter = router({
  info: publicProcedure.query(({ ctx }): SystemInfo => {
    return {
      version: VERSION,
      dataDir: dirname(ctx.dbPath),
      dbPath: ctx.dbPath,
      attachmentsDir: ctx.attachmentsDir,
    };
  }),
});
