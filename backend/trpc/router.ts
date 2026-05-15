import { entriesRouter } from './routers/entries';
import { profileRouter } from './routers/profile';
import { settingsRouter } from './routers/settings';
import { systemRouter } from './routers/system';
import { tagsRouter } from './routers/tags';
import { router } from './trpc';

export const appRouter = router({
  entries: entriesRouter,
  profile: profileRouter,
  settings: settingsRouter,
  system: systemRouter,
  tags: tagsRouter,
});

export type AppRouter = typeof appRouter;
