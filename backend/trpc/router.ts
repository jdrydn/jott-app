import { aiRouter } from './routers/ai';
import { dataRouter } from './routers/data';
import { entriesRouter } from './routers/entries';
import { profileRouter } from './routers/profile';
import { searchRouter } from './routers/search';
import { settingsRouter } from './routers/settings';
import { systemRouter } from './routers/system';
import { tagsRouter } from './routers/tags';
import { router } from './trpc';

export const appRouter = router({
  ai: aiRouter,
  data: dataRouter,
  entries: entriesRouter,
  profile: profileRouter,
  search: searchRouter,
  settings: settingsRouter,
  system: systemRouter,
  tags: tagsRouter,
});

export type AppRouter = typeof appRouter;
