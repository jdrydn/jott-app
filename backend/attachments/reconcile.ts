import { and, eq, inArray, isNull } from 'drizzle-orm';
import { deleteAttachment } from '../data/attachments';
import type { Db } from '../db/client';
import { attachments } from '../db/schema';

export const ATTACHMENT_URL_RE = /\/api\/attachments\/([0-9A-HJKMNP-TV-Z]{26})/g;

export type ReconcileAttachmentsResult = {
  bound: number;
  removed: number;
};

export function extractAttachmentIds(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(ATTACHMENT_URL_RE)) {
    const id = m[1];
    if (id) ids.add(id);
  }
  return [...ids];
}

export function reconcileEntryAttachments(
  db: Db,
  attachmentsDir: string,
  entryId: string,
  body: string,
): ReconcileAttachmentsResult {
  const refIds = extractAttachmentIds(body);

  // Bind currently-orphan rows referenced in this body. We track the count
  // ourselves because drizzle's bun-sqlite .run() doesn't expose `changes`.
  let bound = 0;
  if (refIds.length > 0) {
    const orphans = db
      .select({ id: attachments.id })
      .from(attachments)
      .where(and(inArray(attachments.id, refIds), isNull(attachments.entryId)))
      .all();
    if (orphans.length > 0) {
      db.update(attachments)
        .set({ entryId })
        .where(and(inArray(attachments.id, refIds), isNull(attachments.entryId)))
        .run();
      bound = orphans.length;
    }
  }

  // Delete rows previously bound to this entry whose IDs no longer appear in the body.
  const previously = db
    .select({ id: attachments.id, filename: attachments.filename })
    .from(attachments)
    .where(eq(attachments.entryId, entryId))
    .all();
  const refSet = new Set(refIds);
  const stale = previously.filter((a) => !refSet.has(a.id));
  if (stale.length > 0) {
    db.delete(attachments)
      .where(
        inArray(
          attachments.id,
          stale.map((s) => s.id),
        ),
      )
      .run();
    for (const s of stale) deleteAttachment(attachmentsDir, s.filename);
  }

  return { bound, removed: stale.length };
}
