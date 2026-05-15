CREATE TABLE profile (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'me'),
  name TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  created_at INTEGER NOT NULL
);
