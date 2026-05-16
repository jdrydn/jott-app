import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { type Entry, entries, entryTags } from '../db/schema';

export const ENTRY_CAP = 100;

export type SliceFilter = {
  from?: number;
  to?: number;
  tagId?: string;
};

export function fetchEntrySlice(db: Db, filter: SliceFilter): Entry[] {
  const where = [
    isNull(entries.deletedAt),
    filter.from != null ? gte(entries.createdAt, filter.from) : undefined,
    filter.to != null ? lte(entries.createdAt, filter.to) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  if (filter.tagId != null) {
    const ids = db
      .select({ entryId: entryTags.entryId })
      .from(entryTags)
      .where(eq(entryTags.tagId, filter.tagId))
      .all()
      .map((r) => r.entryId);
    if (ids.length === 0) return [];
    // Newest first, capped, then reversed for chronological prompt order.
    const newest = db
      .select()
      .from(entries)
      .where(and(...where))
      .orderBy(desc(entries.createdAt))
      .all()
      .filter((e) => ids.includes(e.id))
      .slice(0, ENTRY_CAP);
    return newest.reverse();
  }

  const newest = db
    .select()
    .from(entries)
    .where(and(...where))
    .orderBy(desc(entries.createdAt))
    .limit(ENTRY_CAP)
    .all();
  // Reverse to oldest-first so prompts read chronologically.
  return [...newest].sort((a, b) => a.createdAt - b.createdAt);
}
