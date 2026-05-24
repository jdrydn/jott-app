-- Rename the tag type 'user' → 'person'. The original CREATE TABLE in 0002
-- pins the allowed values via a CHECK constraint, so we recreate the table
-- under the new constraint, carrying data over with the value swapped.
-- The migrate runner disables foreign_keys around the batch so the DROP
-- below doesn't cascade into entry_tags.

CREATE TABLE tags_new (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topic', 'person')),
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO tags_new (id, type, name, initials, color, created_at, updated_at)
  SELECT id,
         CASE type WHEN 'user' THEN 'person' ELSE type END,
         name, initials, color, created_at, updated_at
    FROM tags;

DROP TABLE tags;
ALTER TABLE tags_new RENAME TO tags;

CREATE UNIQUE INDEX tags_type_name_idx ON tags (type, name);
