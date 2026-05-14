import { TRPCError } from '@trpc/server';
import { desc, eq, inArray, isNull } from 'drizzle-orm';
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
  })
  .optional();

const createInput = z.object({
  body: z.string().min(1).max(100_000),
});

export const entriesRouter = router({
  list: publicProcedure.input(listInput).query(({ ctx, input }): EntryWithTags[] => {
    const limit = input?.limit ?? 50;
    const rows = ctx.db
      .select()
      .from(entries)
      .where(isNull(entries.deletedAt))
      .orderBy(desc(entries.createdAt))
      .limit(limit)
      .all();
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
});
