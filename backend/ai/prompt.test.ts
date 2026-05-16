import { describe, expect, test } from 'bun:test';
import type { Entry } from '../db/schema';
import { buildAskPrompt, buildReflectPrompt, buildSummarisePrompt } from './prompt';

const entry = (id: string, ms: number, body: string): Entry => ({
  id,
  createdAt: ms,
  updatedAt: ms,
  body,
  deletedAt: null,
});

const SAMPLE: Entry[] = [
  entry('a', new Date('2026-05-13T09:30:00').getTime(), 'Met @priya about #q3-plan.'),
  entry('b', new Date('2026-05-14T16:45:00').getTime(), 'Code review went well.'),
];

describe('buildSummarisePrompt', () => {
  test('includes name, task, and chronological entries', () => {
    const prompt = buildSummarisePrompt(SAMPLE, { name: 'James' });
    expect(prompt).toContain("James's personal journal");
    expect(prompt).toContain('TL;DR');
    expect(prompt).toContain('## 2026-05-13 09:30');
    expect(prompt).toContain('Met @priya about #q3-plan.');
    expect(prompt.indexOf('2026-05-13')).toBeLessThan(prompt.indexOf('2026-05-14'));
  });

  test('falls back to "the user" when name is null', () => {
    const prompt = buildSummarisePrompt(SAMPLE, { name: null });
    expect(prompt).toContain("the user's personal journal");
  });

  test('handles empty entry list with placeholder', () => {
    const prompt = buildSummarisePrompt([], { name: 'James' });
    expect(prompt).toContain('(no entries in this window)');
  });
});

describe('buildReflectPrompt', () => {
  test('asks for themes/patterns and includes entries', () => {
    const prompt = buildReflectPrompt(SAMPLE, { name: 'James' });
    expect(prompt).toContain('themes');
    expect(prompt).toContain('Met @priya');
  });
});

describe('buildAskPrompt', () => {
  test('includes the question and constrains to entries', () => {
    const prompt = buildAskPrompt(SAMPLE, { name: 'James' }, 'When did I last see Priya?');
    expect(prompt).toContain('Question: When did I last see Priya?');
    expect(prompt).toContain('using only the journal entries provided');
  });

  test('trims question whitespace', () => {
    const prompt = buildAskPrompt(SAMPLE, { name: null }, '   what?   ');
    expect(prompt).toContain('Question: what?');
  });
});
