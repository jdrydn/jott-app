import { TRPCError } from '@trpc/server';
import { desc, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';
import { type Entry, entries } from '../../db/schema';
import { publicProcedure, router } from '../trpc';

const listInput = z
  .object({
    limit: z.number().int().min(1).max(200).default(50),
  })
  .optional();

const createInput = z.object({
  body: z.string().min(1).max(100_000),
});

export const entriesRouter = router({
  list: publicProcedure.input(listInput).query(({ ctx, input }): Entry[] => {
    const limit = input?.limit ?? 50;
    return ctx.db
      .select()
      .from(entries)
      .where(isNull(entries.deletedAt))
      .orderBy(desc(entries.createdAt))
      .limit(limit)
      .all();
  }),

  create: publicProcedure.input(createInput).mutation(({ ctx, input }): Entry => {
    const now = Date.now();
    const row = {
      id: ulid(),
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = ctx.db.insert(entries).values(row).returning().get();
    if (!inserted) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'insert returned no row' });
    }
    return inserted;
  }),
});
