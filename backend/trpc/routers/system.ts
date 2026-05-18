import { dirname } from 'node:path';
import { VERSION } from '@shared/version';
import { publicProcedure, router } from '../trpc';

export type SystemInfo = {
  version: string;
  dataDir: string;
  bundled: boolean;
};

export const systemRouter = router({
  info: publicProcedure.query(({ ctx }): SystemInfo => {
    return {
      version: VERSION,
      dataDir: dirname(ctx.dbPath),
      bundled: process.env.JOTT_BUNDLED === 'true',
    };
  }),
});
