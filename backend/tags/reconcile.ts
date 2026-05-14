import { and, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import { defaultColor, defaultInitials, extractTags } from '../../shared/tags';
import type { Db } from '../db/client';
import { entryTags, tags } from '../db/schema';

export type ReconcileResult = {
  linked: number;
  unlinked: number;
  tagsCreated: number;
};

export function reconcileEntryTags(
  db: Db,
  entryId: string,
  body: string,
  now: number,
): ReconcileResult {
  const extracted = extractTags(body);
  const desired = new Map<string, { nameWhenLinked: string }>();
  let tagsCreated = 0;

  for (const e of extracted) {
    const existing = db
      .select()
      .from(tags)
      .where(and(eq(tags.type, e.type), eq(tags.name, e.name)))
      .get();

    let tagId: string;
    if (existing) {
      tagId = existing.id;
    } else {
      tagId = ulid();
      db.insert(tags)
        .values({
          id: tagId,
          type: e.type,
          name: e.name,
          initials: defaultInitials(e.name),
          color: defaultColor(e.name),
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tagsCreated++;
    }

    if (!desired.has(tagId)) {
      desired.set(tagId, { nameWhenLinked: e.nameWhenLinked });
    }
  }

  const current = db.select().from(entryTags).where(eq(entryTags.entryId, entryId)).all();
  const currentIds = new Set(current.map((c) => c.tagId));

  const stale = current.filter((c) => !desired.has(c.tagId)).map((c) => c.tagId);
  if (stale.length > 0) {
    db.delete(entryTags)
      .where(and(eq(entryTags.entryId, entryId), inArray(entryTags.tagId, stale)))
      .run();
  }

  let linked = 0;
  for (const [tagId, { nameWhenLinked }] of desired) {
    if (currentIds.has(tagId)) continue;
    db.insert(entryTags).values({ entryId, tagId, nameWhenLinked, createdAt: now }).run();
    linked++;
  }

  return { linked, unlinked: stale.length, tagsCreated };
}
