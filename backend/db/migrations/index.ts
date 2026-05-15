import init0001 from './0001_init.sql' with { type: 'text' };
import tags0002 from './0002_tags.sql' with { type: 'text' };
import fts0003 from './0003_fts.sql' with { type: 'text' };
import profile0004 from './0004_profile.sql' with { type: 'text' };
import settings0005 from './0005_settings.sql' with { type: 'text' };

export const migrations: readonly string[] = [
  init0001,
  tags0002,
  fts0003,
  profile0004,
  settings0005,
];
