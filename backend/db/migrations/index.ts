import init0001 from './0001_init.sql' with { type: 'text' };
import tags0002 from './0002_tags.sql' with { type: 'text' };
import fts0003 from './0003_fts.sql' with { type: 'text' };

export const migrations: readonly string[] = [init0001, tags0002, fts0003];
