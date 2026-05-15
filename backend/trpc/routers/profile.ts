import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type Profile, profile } from '../../db/schema';
import { publicProcedure, router } from '../trpc';

const upsertInput = z.object({
  name: z.string().trim().min(1).max(64),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

export const profileRouter = router({
  get: publicProcedure.query(({ ctx }): Profile | null => {
    return ctx.db.select().from(profile).where(eq(profile.id, 'me')).get() ?? null;
  }),

  upsert: publicProcedure.input(upsertInput).mutation(({ ctx, input }): Profile => {
    const existing = ctx.db.select().from(profile).where(eq(profile.id, 'me')).get();
    const now = Date.now();

    if (existing) {
      const next = ctx.db
        .update(profile)
        .set({
          name: input.name,
          theme: input.theme ?? existing.theme,
        })
        .where(eq(profile.id, 'me'))
        .returning()
        .get();
      return next ?? existing;
    }

    const inserted = ctx.db
      .insert(profile)
      .values({
        id: 'me',
        name: input.name,
        theme: input.theme ?? 'system',
        createdAt: now,
      })
      .returning()
      .get();
    if (!inserted) {
      throw new Error('profile insert returned no row');
    }
    return inserted;
  }),
});
