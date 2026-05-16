import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';
import { defaultColor, defaultInitials, type TagType } from '../../../shared/tags';
import { entryTags, tags } from '../../db/schema';
import { entryIdsForTag, recomputeRendered } from '../../tags/reconcile';
import { publicProcedure, router } from '../trpc';

export type TagWithStats = {
  id: string;
  type: TagType;
  name: string;
  initials: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  count: number;
  lastSeen: number | null;
};

const NAME_RULE = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z][A-Za-z0-9 _-]*$/,
    'name must start with a letter and use letters/digits/spaces/_-',
  )
  .transform((n) => n.trim());

const createInput = z.object({
  type: z.enum(['topic', 'user']),
  name: NAME_RULE,
});

const renameInput = z.object({
  id: z.string().min(1),
  // Tag names may now contain spaces (e.g. "James Dryden"). The first character
  // must still be a letter so renderers can detect a tag boundary unambiguously.
  name: NAME_RULE,
});

const deleteInput = z.object({ id: z.string().min(1) });

export type CreatedTag = {
  id: string;
  type: TagType;
  name: string;
  initials: string;
  color: string;
};

export const tagsRouter = router({
  create: publicProcedure.input(createInput).mutation(({ ctx, input }): CreatedTag => {
    // De-dupe case-insensitively so picking "Priya" doesn't shadow an existing
    // "priya" — return the existing row instead.
    const wanted = input.name.toLowerCase();
    const existing = ctx.db
      .select()
      .from(tags)
      .where(and(eq(tags.type, input.type), sql`LOWER(${tags.name}) = ${wanted}`))
      .get();
    if (existing) {
      return {
        id: existing.id,
        type: existing.type,
        name: existing.name,
        initials: existing.initials,
        color: existing.color,
      };
    }
    const now = Date.now();
    const id = ulid(now);
    ctx.db
      .insert(tags)
      .values({
        id,
        type: input.type,
        name: input.name,
        initials: defaultInitials(input.name),
        color: defaultColor(input.name),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return {
      id,
      type: input.type,
      name: input.name,
      initials: defaultInitials(input.name),
      color: defaultColor(input.name),
    };
  }),

  list: publicProcedure.query(({ ctx }): TagWithStats[] => {
    return ctx.db
      .select({
        id: tags.id,
        type: tags.type,
        name: tags.name,
        initials: tags.initials,
        color: tags.color,
        createdAt: tags.createdAt,
        updatedAt: tags.updatedAt,
        count: sql<number>`COUNT(${entryTags.entryId})`.as('count'),
        lastSeen: sql<number | null>`MAX(${entryTags.createdAt})`.as('lastSeen'),
      })
      .from(tags)
      .leftJoin(entryTags, eq(entryTags.tagId, tags.id))
      .groupBy(tags.id)
      .all();
  }),

  rename: publicProcedure.input(renameInput).mutation(({ ctx, input }): TagWithStats => {
    return ctx.db.transaction((tx) => {
      const target = tx.select().from(tags).where(eq(tags.id, input.id)).get();
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'tag not found' });
      }
      if (input.name !== target.name) {
        const collision = tx
          .select()
          .from(tags)
          .where(and(eq(tags.type, target.type), eq(tags.name, input.name)))
          .get();
        if (collision && collision.id !== target.id) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `a ${target.type} named "${input.name}" already exists`,
          });
        }
      }
      const now = Date.now();
      tx.update(tags).set({ name: input.name, updatedAt: now }).where(eq(tags.id, input.id)).run();
      const affected = entryIdsForTag(tx, input.id);
      recomputeRendered(tx, affected);
      return {
        ...target,
        name: input.name,
        updatedAt: now,
        count: 0,
        lastSeen: null,
      };
    });
  }),

  delete: publicProcedure.input(deleteInput).mutation(({ ctx, input }): { id: string } => {
    return ctx.db.transaction((tx) => {
      const target = tx.select().from(tags).where(eq(tags.id, input.id)).get();
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'tag not found' });
      }
      // Capture affected entries before the cascade drops their entry_tags rows.
      const affected = entryIdsForTag(tx, input.id);
      tx.delete(tags).where(eq(tags.id, input.id)).run();
      recomputeRendered(tx, affected);
      return { id: input.id };
    });
  }),
});
