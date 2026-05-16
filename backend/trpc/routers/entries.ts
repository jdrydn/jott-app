import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';
import type { TagType } from '../../../shared/tags';
import { reconcileEntryAttachments } from '../../attachments/reconcile';
import type { Db } from '../../db/client';
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
    tagId: z.string().min(1).optional(),
    from: z.number().int().nonnegative().optional(),
    to: z.number().int().nonnegative().optional(),
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

const searchInput = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(200).default(50),
});

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

function attachTags(db: Db, rows: Entry[]): EntryWithTags[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const links = db
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
}

export const entriesRouter = router({
  list: publicProcedure.input(listInput).query(({ ctx, input }): EntryWithTags[] => {
    const limit = input?.limit ?? 50;
    const trash = input?.trash ?? false;
    const order = trash ? desc(entries.deletedAt) : desc(entries.createdAt);

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
      if (linked.length === 0) return [];
      where.push(inArray(entries.id, linked));
    }

    const rows = ctx.db
      .select()
      .from(entries)
      .where(and(...where))
      .orderBy(order)
      .limit(limit)
      .all();
    return attachTags(ctx.db, rows);
  }),

  search: publicProcedure.input(searchInput).query(({ ctx, input }): EntryWithTags[] => {
    const match = buildMatchQuery(input.q);
    if (!match) return [];

    const matches = ctx.db.all<{ id: string }>(sql`
      SELECT entries.id AS id
      FROM entries_fts
      JOIN entries ON entries.rowid = entries_fts.rowid
      WHERE entries_fts MATCH ${match}
        AND entries.deleted_at IS NULL
      ORDER BY bm25(entries_fts), entries.created_at DESC
      LIMIT ${input.limit}
    `);
    if (matches.length === 0) return [];

    const order = new Map(matches.map((m, i) => [m.id, i]));
    const rows = ctx.db
      .select()
      .from(entries)
      .where(inArray(entries.id, [...order.keys()]))
      .all();
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return attachTags(ctx.db, rows);
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
