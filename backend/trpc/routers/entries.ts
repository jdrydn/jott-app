import { TRPCError } from '@trpc/server';
import { desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { TagType } from '../../../shared/tags';
import { type Entry, entries, entryTags, tags } from '../../db/schema';
import { reconcileEntryTags } from '../../tags/reconcile';
import { publicProcedure, router } from '../trpc';

export type EntryTagLink = {
  nameWhenLinked: string;
  tag: {
    id: string;
    type: TagType;
    name: string;
    initials: string;
    color: string;
  };
};

export type EntryWithTags = Entry & { tags: EntryTagLink[] };

const listInput = z
  .object({
    limit: z.number().int().min(1).max(200).default(50),
    trash: z.boolean().default(false),
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

export const entriesRouter = router({
  list: publicProcedure.input(listInput).query(({ ctx, input }): EntryWithTags[] => {
    const limit = input?.limit ?? 50;
    const trash = input?.trash ?? false;
    const filter = trash ? isNotNull(entries.deletedAt) : isNull(entries.deletedAt);
    const order = trash ? desc(entries.deletedAt) : desc(entries.createdAt);
    const rows = ctx.db.select().from(entries).where(filter).orderBy(order).limit(limit).all();
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const links = ctx.db
      .select({
        entryId: entryTags.entryId,
        nameWhenLinked: entryTags.nameWhenLinked,
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
        nameWhenLinked: l.nameWhenLinked,
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
  }),

  create: publicProcedure.input(createInput).mutation(({ ctx, input }): Entry => {
    const now = Date.now();
    const row = {
      id: ulid(),
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };
    return ctx.db.transaction((tx) => {
      const inserted = tx.insert(entries).values(row).returning().get();
      if (!inserted) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'insert returned no row' });
      }
      reconcileEntryTags(tx, inserted.id, inserted.body, now);
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
      const updated = tx
        .update(entries)
        .set({ body: input.body, updatedAt: now })
        .where(eq(entries.id, input.id))
        .returning()
        .get();
      if (!updated) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'update returned no row' });
      }
      reconcileEntryTags(tx, updated.id, updated.body, now);
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
