import { entriesRouter } from './routers/entries';
import { tagsRouter } from './routers/tags';
import { router } from './trpc';

export const appRouter = router({
  entries: entriesRouter,
  tags: tagsRouter,
});

export type AppRouter = typeof appRouter;
