CREATE VIRTUAL TABLE entries_fts USING fts5(
  body,
  content='entries',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

INSERT INTO entries_fts(rowid, body)
  SELECT rowid, body FROM entries;

CREATE TRIGGER entries_fts_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, body) VALUES (new.rowid, new.body);
END;

CREATE TRIGGER entries_fts_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, body) VALUES('delete', old.rowid, old.body);
END;

CREATE TRIGGER entries_fts_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, body) VALUES('delete', old.rowid, old.body);
  INSERT INTO entries_fts(rowid, body) VALUES (new.rowid, new.body);
END;
