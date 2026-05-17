import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { TagType } from '../../../shared/tags';
import { reconcileEntryAttachments } from '../../attachments/reconcile';
import type { Db } from '../../db/client';
import { type Entry, entries, entryTags, tags } from '../../db/schema';
import { linkEntryTags, prepareEntryBody } from '../../tags/reconcile';
import { publicProcedure, router } from '../trpc';

export type EntryTagLink = {
  tag: {
    id: string;
    type: TagType;
    name: string;
    initials: string;
    color: string;
  };
};

export type EntryWithTags = Entry & { tags: EntryTagLink[] };

export type ListCursor = { ts: number; id: string };

export type EntryPage = { items: EntryWithTags[]; nextCursor: ListCursor | null };

const cursorInput = z.object({
  ts: z.number().int().nonnegative(),
  id: z.string().min(1),
});

const listInput = z
  .object({
    limit: z.number().int().min(1).max(200).default(100),
    trash: z.boolean().default(false),
    tagId: z.string().min(1).optional(),
    from: z.number().int().nonnegative().optional(),
    to: z.number().int().nonnegative().optional(),
    cursor: cursorInput.nullish(),
  })
  .optional();

const createInput = z.object({
  body: z.string().min(1).max(100_000),
});

const updateInput = z.object({
  id: z.string().min(1),
  body: z.string().min(1).max(100_000),
});

const idInput = z.object({ id: z.string().min(1) });

function attachTags(db: Db, rows: Entry[]): EntryWithTags[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const links = db
    .select({
      entryId: entryTags.entryId,
      tagId: tags.id,
      type: tags.type,
      name: tags.name,
      initials: tags.initials,
      color: tags.color,
    })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(inArray(entryTags.entryId, ids))
    .all();
  const byEntry = new Map<string, EntryTagLink[]>();
  for (const l of links) {
    const arr = byEntry.get(l.entryId) ?? [];
    arr.push({
      tag: {
        id: l.tagId,
        type: l.type,
        name: l.name,
        initials: l.initials,
        color: l.color,
      },
    });
    byEntry.set(l.entryId, arr);
  }
  return rows.map((r) => ({ ...r, tags: byEntry.get(r.id) ?? [] }));
}

export const entriesRouter = router({
  list: publicProcedure.input(listInput).query(({ ctx, input }): EntryPage => {
    const limit = input?.limit ?? 100;
    const trash = input?.trash ?? false;
    const orderColumn = trash ? entries.deletedAt : entries.createdAt;

    const where = [trash ? isNotNull(entries.deletedAt) : isNull(entries.deletedAt)];
    if (input?.from != null) where.push(gte(entries.createdAt, input.from));
    if (input?.to != null) where.push(lte(entries.createdAt, input.to));
    if (input?.tagId) {
      const linked = ctx.db
        .select({ entryId: entryTags.entryId })
        .from(entryTags)
        .where(eq(entryTags.tagId, input.tagId))
        .all()
        .map((r) => r.entryId);
      if (linked.length === 0) return { items: [], nextCursor: null };
      where.push(inArray(entries.id, linked));
    }
    if (input?.cursor) {
      const cursorCond = or(
        lt(orderColumn, input.cursor.ts),
        and(eq(orderColumn, input.cursor.ts), lt(entries.id, input.cursor.id)),
      );
      if (cursorCond) where.push(cursorCond);
    }

    const rows = ctx.db
      .select()
      .from(entries)
      .where(and(...where))
      .orderBy(desc(orderColumn), desc(entries.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor: ListCursor | null =
      hasMore && last ? { ts: (trash ? last.deletedAt : last.createdAt) ?? 0, id: last.id } : null;

    return { items: attachTags(ctx.db, items), nextCursor };
  }),

  create: publicProcedure.input(createInput).mutation(({ ctx, input }): Entry => {
    const now = Date.now();
    return ctx.db.transaction((tx) => {
      const prep = prepareEntryBody(tx, input.body, now);
      const inserted = tx
        .insert(entries)
        .values({
          id: ulid(now),
          body: prep.body,
          bodyRendered: prep.bodyRendered,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'insert returned no row' });
      }
      linkEntryTags(tx, inserted.id, prep.tagIds, now);
      reconcileEntryAttachments(tx, ctx.attachmentsDir, inserted.id, inserted.body);
      return inserted;
    });
  }),

  update: publicProcedure.input(updateInput).mutation(({ ctx, input }): Entry => {
    const now = Date.now();
    return ctx.db.transaction((tx) => {
      const existing = tx.select().from(entries).where(eq(entries.id, input.id)).get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'entry not found' });
      }
      if (existing.deletedAt != null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'cannot edit a deleted entry' });
      }
      const prep = prepareEntryBody(tx, input.body, now);
      const updated = tx
        .update(entries)
        .set({ body: prep.body, bodyRendered: prep.bodyRendered, updatedAt: now })
        .where(eq(entries.id, input.id))
        .returning()
        .get();
      if (!updated) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'update returned no row' });
      }
      linkEntryTags(tx, updated.id, prep.tagIds, now);
      reconcileEntryAttachments(tx, ctx.attachmentsDir, updated.id, updated.body);
      return updated;
    });
  }),

  delete: publicProcedure.input(idInput).mutation(({ ctx, input }): Entry => {
    const now = Date.now();
    const existing = ctx.db.select().from(entries).where(eq(entries.id, input.id)).get();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'entry not found' });
    }
    if (existing.deletedAt != null) return existing;
    const updated = ctx.db
      .update(entries)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(entries.id, input.id))
      .returning()
      .get();
    if (!updated) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'delete returned no row' });
    }
    return updated;
  }),

  restore: publicProcedure.input(idInput).mutation(({ ctx, input }): Entry => {
    const now = Date.now();
    const existing = ctx.db.select().from(entries).where(eq(entries.id, input.id)).get();
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'entry not found' });
    }
    if (existing.deletedAt == null) return existing;
    const updated = ctx.db
      .update(entries)
      .set({ deletedAt: null, updatedAt: now })
      .where(eq(entries.id, input.id))
      .returning()
      .get();
    if (!updated) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'restore returned no row' });
    }
    return updated;
  }),
});
