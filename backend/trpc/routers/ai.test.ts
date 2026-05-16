import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { ClaudeDetection } from '../../ai/claude';
import { migrate } from '../../db/migrate';
import * as schema from '../../db/schema';
import { appRouter } from '../router';
import { createCallerFactory } from '../trpc';
import { SETTING_DEFAULTS } from './settings';

const createCaller = createCallerFactory(appRouter);

const CLAUDE_OFF: ClaudeDetection = { available: false, binaryPath: null, version: null };
const CLAUDE_ON: ClaudeDetection = {
  available: true,
  binaryPath: '/usr/local/bin/claude',
  version: '1.2.3',
};

function setup(claude: ClaudeDetection) {
  const raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return createCaller({
    db,
    raw,
    dbPath: ':memory:',
    attachmentsDir: '/tmp/jottapp-test-attachments',
    claude,
  });
}

describe('ai.status', () => {
  test('disabled when claude is not on PATH', async () => {
    const caller = setup(CLAUDE_OFF);
    const status = await caller.ai.status();
    expect(status.driver).toBe('claude');
    expect(status.enabled).toBe(false);
    expect(status.reason).toMatch(/not found/i);
    expect(status.model).toBe(SETTING_DEFAULTS['ai.claude.model']);
    expect(status.binaryPath).toBeNull();
  });

  test('enabled when claude is detected and driver is claude', async () => {
    const caller = setup(CLAUDE_ON);
    const status = await caller.ai.status();
    expect(status.enabled).toBe(true);
    expect(status.driver).toBe('claude');
    expect(status.binaryPath).toBe('/usr/local/bin/claude');
    expect(status.version).toBe('1.2.3');
    expect(status.reason).toBeUndefined();
  });

  test('reflects ai.claude.model override', async () => {
    const caller = setup(CLAUDE_ON);
    await caller.settings.set({ key: 'ai.claude.model', value: 'opus' });
    const status = await caller.ai.status();
    expect(status.model).toBe('opus');
  });

  test('disabled with reason when driver is unknown', async () => {
    const caller = setup(CLAUDE_ON);
    await caller.settings.set({ key: 'ai.driver', value: 'gemini' });
    const status = await caller.ai.status();
    expect(status.enabled).toBe(false);
    expect(status.driver).toBe('gemini');
    expect(status.reason).toMatch(/unknown/i);
  });
});

describe('ai.slicePreview', () => {
  test('reports zero count and null bounds when nothing matches', async () => {
    const caller = setup(CLAUDE_OFF);
    const preview = await caller.ai.slicePreview({});
    expect(preview).toEqual({ count: 0, oldest: null, newest: null, cap: 100 });
  });

  test('reports actual count + bounds when entries exist (no cap hit)', async () => {
    const caller = setup(CLAUDE_OFF);
    await caller.entries.create({ body: 'a' });
    await Bun.sleep(2);
    await caller.entries.create({ body: 'b' });
    const preview = await caller.ai.slicePreview({});
    expect(preview.count).toBe(2);
    expect(preview.oldest).not.toBeNull();
    expect(preview.newest).not.toBeNull();
    expect(preview.oldest).toBeLessThan(preview.newest ?? 0);
    expect(preview.cap).toBe(100);
  });

  test('does not require AI to be enabled', async () => {
    const caller = setup(CLAUDE_OFF);
    await caller.entries.create({ body: 'x' });
    await expect(caller.ai.slicePreview({})).resolves.toBeDefined();
  });
});

describe('ai.summarise (precondition checks)', () => {
  test('rejects when claude is not available', async () => {
    const caller = setup(CLAUDE_OFF);
    await caller.entries.create({ body: 'something' });
    await expect(caller.ai.summarise({})).rejects.toThrow(/not found/i);
  });

  test('rejects when driver is not claude', async () => {
    const caller = setup(CLAUDE_ON);
    await caller.settings.set({ key: 'ai.driver', value: 'gemini' });
    await caller.entries.create({ body: 'something' });
    await expect(caller.ai.summarise({})).rejects.toThrow(/unknown ai driver/i);
  });

  test('rejects when no entries match the window', async () => {
    const caller = setup(CLAUDE_ON);
    // No entries seeded at all.
    await expect(caller.ai.summarise({})).rejects.toThrow(/no entries/i);
  });
});

describe('ai.ask (validation)', () => {
  test('rejects empty question', async () => {
    const caller = setup(CLAUDE_ON);
    await caller.entries.create({ body: 'x' });
    // biome-ignore lint/suspicious/noExplicitAny: invalid input by design
    await expect(caller.ai.ask({ q: '' } as any)).rejects.toThrow();
  });

  test('rejects oversized question', async () => {
    const caller = setup(CLAUDE_ON);
    await caller.entries.create({ body: 'x' });
    await expect(caller.ai.ask({ q: 'x'.repeat(2001) })).rejects.toThrow();
  });
});
