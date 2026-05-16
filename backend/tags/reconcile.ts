import { and, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  defaultColor,
  defaultInitials,
  extractBareTags,
  extractTagRefs,
  formatTagRef,
  renderBody,
  TAG_REGEX,
  type TagType,
} from '../../shared/tags';
import type { Db } from '../db/client';
import { entries, entryTags, tags } from '../db/schema';

export type PreparedBody = {
  body: string; // canonical: bare tokens rewritten to {{ tag id=ULID }}
  bodyRendered: string; // markers resolved to @name / #name
  tagIds: string[]; // unique tag ids referenced by the body
  tagsCreated: number;
};

export type ReconcileResult = PreparedBody & {
  linked: number;
  unlinked: number;
};

// Phase 1: rewrite bare `#foo`/`@foo` to ULID markers (find-or-create tags),
// compute the rendered form, and return the set of referenced tag ids. Pure
// w.r.t. entries; may create new rows in `tags`.
export function prepareEntryBody(db: Db, rawBody: string, now: number): PreparedBody {
  const bareToId = new Map<string, string>();
  let tagsCreated = 0;

  for (const bare of extractBareTags(rawBody)) {
    const existing = db
      .select()
      .from(tags)
      .where(and(eq(tags.type, bare.type), eq(tags.name, bare.name)))
      .get();
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      id = ulid(now);
      db.insert(tags)
        .values({
          id,
          type: bare.type,
          name: bare.name,
          initials: defaultInitials(bare.name),
          color: defaultColor(bare.name),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tagsCreated++;
    }
    bareToId.set(`${bare.type}:${bare.name}`, id);
  }

  const body = rawBody.replace(TAG_REGEX, (full, sigil: string, word: string) => {
    const type: TagType = sigil === '#' ? 'topic' : 'user';
    const name = word.toLowerCase();
    const id = bareToId.get(`${type}:${name}`);
    return id ? formatTagRef(id) : full;
  });

  const refIds = [...new Set(extractTagRefs(body))];
  const byId = new Map<string, { type: TagType; name: string }>();
  if (refIds.length > 0) {
    const rows = db.select().from(tags).where(inArray(tags.id, refIds)).all();
    for (const t of rows) byId.set(t.id, { type: t.type, name: t.name });
  }
  // Drop refs pointing at non-existent tags from the linkage set so we don't
  // try to insert dangling entry_tags rows. The marker is left in the body
  // verbatim (renderer renders it as literal text).
  const validIds = refIds.filter((id) => byId.has(id));

  const bodyRendered = renderBody(body, byId);

  return { body, bodyRendered, tagIds: validIds, tagsCreated };
}

// Phase 2: reconcile entry_tags links to the desired set of tag ids.
export function linkEntryTags(
  db: Db,
  entryId: string,
  desiredIds: readonly string[],
  now: number,
): { linked: number; unlinked: number } {
  const desired = new Set(desiredIds);
  const current = db.select().from(entryTags).where(eq(entryTags.entryId, entryId)).all();
  const currentIds = new Set(current.map((c) => c.tagId));

  const stale = current.filter((c) => !desired.has(c.tagId)).map((c) => c.tagId);
  if (stale.length > 0) {
    db.delete(entryTags)
      .where(and(eq(entryTags.entryId, entryId), inArray(entryTags.tagId, stale)))
      .run();
  }

  let linked = 0;
  for (const id of desired) {
    if (currentIds.has(id)) continue;
    db.insert(entryTags).values({ entryId, tagId: id, createdAt: now }).run();
    linked++;
  }
  return { linked, unlinked: stale.length };
}

// Convenience wrapper for callers (seed scripts, ad-hoc tools) that have an
// entry row in hand and want both phases applied. The router uses the split
// functions directly so it can persist body + bodyRendered in one write.
export function reconcileEntryTags(
  db: Db,
  entryId: string,
  rawBody: string,
  now: number,
): ReconcileResult {
  const prep = prepareEntryBody(db, rawBody, now);
  db.update(entries)
    .set({ body: prep.body, bodyRendered: prep.bodyRendered })
    .where(eq(entries.id, entryId))
    .run();
  const links = linkEntryTags(db, entryId, prep.tagIds, now);
  return { ...prep, ...links };
}

// Recompute and persist `body_rendered` for the given entry ids. Used after a
// tag rename or delete to keep FTS + display in sync without touching the
// canonical `body` column. Unknown refs fall through as literal marker text.
export function recomputeRendered(db: Db, entryIds: readonly string[]): number {
  if (entryIds.length === 0) return 0;
  const rows = db
    .select()
    .from(entries)
    .where(inArray(entries.id, [...entryIds]))
    .all();
  let touched = 0;
  for (const row of rows) {
    const refIds = [...new Set(extractTagRefs(row.body))];
    const byId = new Map<string, { type: TagType; name: string }>();
    if (refIds.length > 0) {
      const tagRows = db.select().from(tags).where(inArray(tags.id, refIds)).all();
      for (const t of tagRows) byId.set(t.id, { type: t.type, name: t.name });
    }
    const next = renderBody(row.body, byId);
    if (next !== row.bodyRendered) {
      db.update(entries).set({ bodyRendered: next }).where(eq(entries.id, row.id)).run();
      touched++;
    }
  }
  return touched;
}

export function entryIdsForTag(db: Db, tagId: string): string[] {
  return db
    .select({ entryId: entryTags.entryId })
    .from(entryTags)
    .where(eq(entryTags.tagId, tagId))
    .all()
    .map((r) => r.entryId);
}
