import { describe, expect, test } from 'bun:test';
import { askPlaceholder, formatWindowSummary } from './AiPanel';

describe('askPlaceholder', () => {
  test('falls back to a generic prompt when nothing is filtered', () => {
    expect(askPlaceholder(undefined)).toBe('What was my last week like');
  });

  test('addresses people for user-type tags', () => {
    expect(askPlaceholder({ type: 'user', name: 'priya' })).toBe('When did I speak to @priya');
  });

  test('addresses topics for topic-type tags', () => {
    expect(askPlaceholder({ type: 'topic', name: 'q3-plan' })).toBe(
      'When did I last speak about #q3-plan',
    );
  });
});

describe('formatWindowSummary', () => {
  const may11 = new Date('2026-05-11T10:00:00').getTime();
  const may15 = new Date('2026-05-15T10:00:00').getTime();

  test('shows "(loading…)" when preview is undefined', () => {
    const out = formatWindowSummary({ filters: {}, activeTagName: null, preview: undefined });
    expect(out).toContain('all time');
    expect(out).toContain('(loading…)');
  });

  test('shows "(no entries)" when count is 0', () => {
    const out = formatWindowSummary({
      filters: {},
      activeTagName: null,
      preview: { count: 0, oldest: null, newest: null, cap: 100 },
    });
    expect(out).toContain('(no entries)');
  });

  test('shows actual count without a date when below the cap', () => {
    const out = formatWindowSummary({
      filters: {},
      activeTagName: null,
      preview: { count: 7, oldest: may11, newest: may15, cap: 100 },
    });
    expect(out).toContain('7 entries');
    expect(out).not.toContain('back to');
  });

  test('uses singular "entry" for count of 1', () => {
    const out = formatWindowSummary({
      filters: {},
      activeTagName: null,
      preview: { count: 1, oldest: may11, newest: may11, cap: 100 },
    });
    expect(out).toContain('1 entry');
    expect(out).not.toContain('back to');
  });

  test('shows "most recent N, back to <date>" when capped', () => {
    const out = formatWindowSummary({
      filters: {},
      activeTagName: null,
      preview: { count: 100, oldest: may11, newest: may15, cap: 100 },
    });
    expect(out).toContain('most recent 100');
    expect(out).toContain('back to');
  });

  test('appends the active tag', () => {
    const out = formatWindowSummary({
      filters: {},
      activeTagName: 'q3-plan',
      preview: { count: 12, oldest: may11, newest: may15, cap: 100 },
    });
    expect(out).toContain('#q3-plan');
  });

  test('formats a from→to range', () => {
    const out = formatWindowSummary({
      filters: { from: may11, to: may15 },
      activeTagName: null,
      preview: { count: 12, oldest: may11, newest: may15, cap: 100 },
    });
    expect(out).toContain('→');
  });
});
