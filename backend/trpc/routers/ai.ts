import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { runClaude } from '../../ai/claude';
import { ENTRY_CAP, fetchEntrySlice, type SliceFilter } from '../../ai/entrySlice';
import {
  buildAskPrompt,
  buildReflectPrompt,
  buildSummarisePrompt,
  type PromptContext,
} from '../../ai/prompt';
import type { Entry } from '../../db/schema';
import { profile, settings } from '../../db/schema';
import type { Context } from '../context';
import { publicProcedure, router } from '../trpc';
import { SETTING_DEFAULTS, type SettingKey } from './settings';

export type AiStatus = {
  driver: string;
  enabled: boolean;
  reason?: string;
  model: string;
  binaryPath: string | null;
  version: string | null;
};

export type AiResult = {
  text: string;
  entryCount: number;
  model: string;
};

export type AiSlicePreview = {
  count: number;
  oldest: number | null;
  newest: number | null;
  cap: number;
};

const RELEVANT_KEYS: SettingKey[] = ['ai.driver', 'ai.claude.config-dir', 'ai.claude.model'];

const sliceInput = z.object({
  from: z.number().int().nonnegative().optional(),
  to: z.number().int().nonnegative().optional(),
  tagId: z.string().min(1).optional(),
});

const askInput = sliceInput.extend({
  q: z.string().trim().min(1).max(2_000),
});

function readSettings(ctx: Context): Record<SettingKey, string> {
  const rows = ctx.db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, RELEVANT_KEYS as unknown as string[]))
    .all();
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key as SettingKey] = r.value;
  return out;
}

function readProfileName(ctx: Context): string | null {
  const row = ctx.db.select({ name: profile.name }).from(profile).where(eq(profile.id, 'me')).get();
  return row?.name ?? null;
}

type ActiveAi = {
  driver: string;
  binaryPath: string;
  configDir: string;
  model: string;
};

function requireActiveAi(ctx: Context): ActiveAi {
  const s = readSettings(ctx);
  if (s['ai.driver'] !== 'claude') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `unknown ai driver: ${s['ai.driver']}`,
    });
  }
  if (!ctx.claude.available || !ctx.claude.binaryPath) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'claude binary not found on PATH',
    });
  }
  return {
    driver: 'claude',
    binaryPath: ctx.claude.binaryPath,
    configDir: s['ai.claude.config-dir'],
    model: s['ai.claude.model'],
  };
}

async function runWithSlice(
  ctx: Context,
  filter: SliceFilter,
  buildPrompt: (entries: Entry[], pc: PromptContext) => string,
): Promise<AiResult> {
  const ai = requireActiveAi(ctx);
  const slice = fetchEntrySlice(ctx.db, filter);
  if (slice.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'no entries match the requested window',
    });
  }
  const prompt = buildPrompt(slice, { name: readProfileName(ctx) });
  const text = await runClaude({
    binaryPath: ai.binaryPath,
    configDir: ai.configDir,
    model: ai.model,
    prompt,
  });
  return { text, entryCount: slice.length, model: ai.model };
}

export const aiRouter = router({
  slicePreview: publicProcedure.input(sliceInput).query(({ ctx, input }): AiSlicePreview => {
    const slice = fetchEntrySlice(ctx.db, input);
    return {
      count: slice.length,
      oldest: slice.length > 0 ? (slice[0]?.createdAt ?? null) : null,
      newest: slice.length > 0 ? (slice[slice.length - 1]?.createdAt ?? null) : null,
      cap: ENTRY_CAP,
    };
  }),

  status: publicProcedure.query(({ ctx }): AiStatus => {
    const s = readSettings(ctx);
    const driver = s['ai.driver'];
    const model = s['ai.claude.model'];

    if (driver !== 'claude') {
      return {
        driver,
        enabled: false,
        reason: `unknown ai driver: ${driver}`,
        model,
        binaryPath: null,
        version: null,
      };
    }
    if (!ctx.claude.available) {
      return {
        driver,
        enabled: false,
        reason: 'claude binary not found on PATH',
        model,
        binaryPath: null,
        version: null,
      };
    }
    return {
      driver,
      enabled: true,
      model,
      binaryPath: ctx.claude.binaryPath,
      version: ctx.claude.version,
    };
  }),

  summarise: publicProcedure
    .input(sliceInput)
    .mutation(({ ctx, input }) => runWithSlice(ctx, input, buildSummarisePrompt)),

  reflect: publicProcedure
    .input(sliceInput)
    .mutation(({ ctx, input }) => runWithSlice(ctx, input, buildReflectPrompt)),

  ask: publicProcedure.input(askInput).mutation(({ ctx, input }) => {
    const { q, ...filter } = input;
    return runWithSlice(ctx, filter, (entries, pc) => buildAskPrompt(entries, pc, q));
  }),
});
