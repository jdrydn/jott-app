-- M8: tags v2 — body stores {{ tag id=ULID }} markers; a derived body_rendered
-- column carries the resolved @name/#name form for FTS to index. nameWhenLinked
-- is gone — rename-on-display falls out for free since the body references tags
-- by ID directly.

ALTER TABLE entries ADD COLUMN body_rendered TEXT NOT NULL DEFAULT '';

-- Seed the derived field with the existing body so pre-migration rows stay
-- searchable until the reconciler rewrites them on next save.
UPDATE entries SET body_rendered = body;

ALTER TABLE entry_tags DROP COLUMN name_when_linked;

-- Rebuild FTS against body_rendered. The contentless table + triggers pattern
-- stays the same; only the indexed column changes.
DROP TRIGGER IF EXISTS entries_fts_ai;
DROP TRIGGER IF EXISTS entries_fts_ad;
DROP TRIGGER IF EXISTS entries_fts_au;
DROP TABLE IF EXISTS entries_fts;

CREATE VIRTUAL TABLE entries_fts USING fts5(
  body_rendered,
  content='entries',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

INSERT INTO entries_fts(rowid, body_rendered)
  SELECT rowid, body_rendered FROM entries;

CREATE TRIGGER entries_fts_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, body_rendered) VALUES (new.rowid, new.body_rendered);
END;

CREATE TRIGGER entries_fts_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, body_rendered) VALUES('delete', old.rowid, old.body_rendered);
END;

CREATE TRIGGER entries_fts_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, body_rendered) VALUES('delete', old.rowid, old.body_rendered);
  INSERT INTO entries_fts(rowid, body_rendered) VALUES (new.rowid, new.body_rendered);
END;
