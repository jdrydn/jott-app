import { VERSION } from '@shared/version';
import { publicProcedure, router } from '../trpc';

export type SystemInfo = {
  version: string;
  dbPath: string;
  attachmentsDir: string;
};

export const systemRouter = router({
  info: publicProcedure.query(({ ctx }): SystemInfo => {
    return { version: VERSION, dbPath: ctx.dbPath, attachmentsDir: ctx.attachmentsDir };
  }),
});
