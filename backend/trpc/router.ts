import { entriesRouter } from './routers/entries';
import { router } from './trpc';

export const appRouter = router({
  entries: entriesRouter,
});

export type AppRouter = typeof appRouter;
