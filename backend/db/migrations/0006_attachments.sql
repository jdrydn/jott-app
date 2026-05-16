CREATE TABLE attachments (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image')),
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX attachments_entry_id_idx ON attachments (entry_id);
