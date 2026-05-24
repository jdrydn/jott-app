-- Recovery: rebuild entry_tags from `{{ tag id=ULID }}` markers in entry bodies.
-- 0009 (prior version) ran with foreign_keys ON inside a transaction — its
-- PRAGMA toggle was a no-op, so the DROP TABLE tags cascaded into entry_tags
-- and wiped every link. The canonical body markers are still intact in
-- entries.body, so we re-derive the links from them.
--
-- Markers are exactly `{{ tag id=` (10 chars) + 26-char ULID + ` }}`.
-- The recursive CTE walks each entry body, peeling off one marker per step.
-- We INSERT OR IGNORE in case some links survived (idempotent).

WITH RECURSIVE markers(entry_id, remaining, tag_id) AS (
  SELECT id, body, NULL
    FROM entries
    WHERE body LIKE '%{{ tag id=%'
  UNION ALL
  SELECT entry_id,
         SUBSTR(remaining, INSTR(remaining, '{{ tag id=') + 36),
         SUBSTR(remaining, INSTR(remaining, '{{ tag id=') + 10, 26)
    FROM markers
    WHERE INSTR(remaining, '{{ tag id=') > 0
)
INSERT OR IGNORE INTO entry_tags (entry_id, tag_id, created_at)
  SELECT m.entry_id, m.tag_id, e.updated_at
    FROM markers m
    JOIN entries e ON e.id = m.entry_id
    JOIN tags t ON t.id = m.tag_id
    WHERE m.tag_id IS NOT NULL;
