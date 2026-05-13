CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  body TEXT NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX entries_created_at_idx ON entries (created_at);
