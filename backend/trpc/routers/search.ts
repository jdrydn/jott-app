import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TagType } from '../../../shared/tags';
import { publicProcedure, router } from '../trpc';

export type PersonHit = {
  tagId: string;
  name: string;
  initials: string;
  color: string;
  entryCount: number;
};

export type TopicHit = {
  tagId: string;
  name: string;
  color: string;
  entryCount: number;
};

export type EntryHit = {
  entryId: string;
  snippet: string;
  createdAt: number;
};

export type SearchResult = {
  people: PersonHit[];
  topics: TopicHit[];
  entries: EntryHit[];
};

const queryInput = z.object({
  q: z.string().min(1).max(200),
});

const PEOPLE_TOPIC_LIMIT = 5;
const ENTRY_LIMIT = 10;

// SQL LIKE wildcards live inside the pattern string, so escape any user-supplied
// `%`, `_`, or our chosen escape char `\` before wrapping in `%…%`.
function likePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

// Quote punctuation-bearing tokens so they don't blow up FTS5's parser, and
// prefix-match the final alnum token so partial typing returns hits.
function buildMatchQuery(q: string): string | null {
  const cleaned = q.replace(/[^\w\s-]/g, ' ').trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens
    .map((tok, i) => {
      const isLast = i === tokens.length - 1;
      const isSimple = /^[A-Za-z0-9_]+$/.test(tok);
      if (isLast && isSimple) return `${tok}*`;
      return `"${tok}"`;
    })
    .join(' ');
}

type TagRow = {
  id: string;
  name: string;
  initials: string;
  color: string;
  entry_count: number;
};

function searchTags(ctx: { db: import('../../db/client').Db }, type: TagType, q: string): TagRow[] {
  const pattern = likePattern(q);
  return ctx.db.all<TagRow>(sql`
    SELECT
      tags.id        AS id,
      tags.name      AS name,
      tags.initials  AS initials,
      tags.color     AS color,
      COUNT(entry_tags.entry_id) AS entry_count
    FROM tags
    LEFT JOIN entry_tags ON entry_tags.tag_id = tags.id
    WHERE tags.type = ${type}
      AND tags.name LIKE ${pattern} ESCAPE '\\'
    GROUP BY tags.id
    ORDER BY entry_count DESC, tags.name COLLATE NOCASE ASC
    LIMIT ${PEOPLE_TOPIC_LIMIT}
  `);
}

type EntryRow = {
  id: string;
  created_at: number;
  snippet: string;
};

function searchEntries(ctx: { db: import('../../db/client').Db }, q: string): EntryRow[] {
  const match = buildMatchQuery(q);
  if (!match) return [];
  // snippet(table, col, start, end, ellipsis, num_tokens). `body_rendered` is
  // the only indexed column (col 0). Plain `[…]` markers — frontend can render
  // them as bold/highlighted if it wants.
  return ctx.db.all<EntryRow>(sql`
    SELECT
      entries.id         AS id,
      entries.created_at AS created_at,
      snippet(entries_fts, 0, '[', ']', '…', 12) AS snippet
    FROM entries_fts
    JOIN entries ON entries.rowid = entries_fts.rowid
    WHERE entries_fts MATCH ${match}
      AND entries.deleted_at IS NULL
    ORDER BY bm25(entries_fts), entries.created_at DESC
    LIMIT ${ENTRY_LIMIT}
  `);
}

export const searchRouter = router({
  query: publicProcedure.input(queryInput).query(({ ctx, input }): SearchResult => {
    const q = input.q.trim();
    if (!q) return { people: [], topics: [], entries: [] };

    const people = searchTags(ctx, 'person', q).map(
      (r): PersonHit => ({
        tagId: r.id,
        name: r.name,
        initials: r.initials,
        color: r.color,
        entryCount: r.entry_count,
      }),
    );
    const topics = searchTags(ctx, 'topic', q).map(
      (r): TopicHit => ({
        tagId: r.id,
        name: r.name,
        color: r.color,
        entryCount: r.entry_count,
      }),
    );
    const entries = searchEntries(ctx, q).map(
      (r): EntryHit => ({
        entryId: r.id,
        snippet: r.snippet,
        createdAt: r.created_at,
      }),
    );
    return { people, topics, entries };
  }),
});
