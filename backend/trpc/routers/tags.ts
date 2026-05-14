import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TagType } from '../../../shared/tags';
import { entryTags, tags } from '../../db/schema';
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

const renameInput = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'name must start with a letter and use letters/digits/_-'),
});

const deleteInput = z.object({ id: z.string().min(1) });

export const tagsRouter = router({
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
    const target = ctx.db.select().from(tags).where(eq(tags.id, input.id)).get();
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'tag not found' });
    }
    const nextName = input.name.toLowerCase();
    if (nextName !== target.name) {
      const collision = ctx.db
        .select()
        .from(tags)
        .where(and(eq(tags.type, target.type), eq(tags.name, nextName)))
        .get();
      if (collision) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `a ${target.type} named "${nextName}" already exists`,
        });
      }
    }
    const now = Date.now();
    ctx.db.update(tags).set({ name: nextName, updatedAt: now }).where(eq(tags.id, input.id)).run();
    return {
      ...target,
      name: nextName,
      updatedAt: now,
      count: 0,
      lastSeen: null,
    };
  }),

  delete: publicProcedure.input(deleteInput).mutation(({ ctx, input }): { id: string } => {
    const target = ctx.db.select().from(tags).where(eq(tags.id, input.id)).get();
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'tag not found' });
    }
    ctx.db.delete(tags).where(eq(tags.id, input.id)).run();
    return { id: input.id };
  }),
});
