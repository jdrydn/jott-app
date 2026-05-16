import init0001 from './0001_init.sql' with { type: 'text' };
import tags0002 from './0002_tags.sql' with { type: 'text' };
import fts0003 from './0003_fts.sql' with { type: 'text' };
import profile0004 from './0004_profile.sql' with { type: 'text' };
import settings0005 from './0005_settings.sql' with { type: 'text' };
import attachments0006 from './0006_attachments.sql' with { type: 'text' };
import tagsV2_0007 from './0007_tags_v2.sql' with { type: 'text' };

export const migrations: readonly string[] = [
  init0001,
  tags0002,
  fts0003,
  profile0004,
  settings0005,
  attachments0006,
  tagsV2_0007,
];
