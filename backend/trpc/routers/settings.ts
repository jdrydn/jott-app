import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { settings } from '../../db/schema';
import { publicProcedure, router } from '../trpc';

// Empty defaults mean "let the driver fall back to its own default".
// e.g. claude with no CLAUDE_CONFIG_DIR uses ~/.claude implicitly.
export const SETTING_DEFAULTS = {
  'ai.driver': 'claude',
  'ai.claude.config-dir': '',
  'ai.claude.model': 'sonnet',
  'backup.onQuit': 'false',
  'backup.dir': '',
} satisfies Record<string, string>;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingsMap = Record<SettingKey, string>;

const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as [SettingKey, ...SettingKey[]];

const settingKey = z.enum(SETTING_KEYS);

const setInput = z.object({
  key: settingKey,
  value: z.string().trim().max(1024),
});

export const settingsRouter = router({
  getAll: publicProcedure.query(({ ctx }): SettingsMap => {
    const rows = ctx.db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, SETTING_KEYS as unknown as string[]))
      .all();
    const out: SettingsMap = { ...SETTING_DEFAULTS };
    for (const r of rows) out[r.key as SettingKey] = r.value;
    return out;
  }),

  set: publicProcedure.input(setInput).mutation(({ ctx, input }): { key: SettingKey } => {
    const now = Date.now();
    if (input.value === '') {
      ctx.db.delete(settings).where(eq(settings.key, input.key)).run();
      return { key: input.key };
    }
    ctx.db
      .insert(settings)
      .values({ key: input.key, value: input.value, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: input.value, updatedAt: now },
      })
      .run();
    return { key: input.key };
  }),
});
