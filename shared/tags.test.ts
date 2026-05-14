import { describe, expect, test } from 'bun:test';
import { defaultColor, defaultInitials, extractTags, TAG_REGEX, tagSigil } from './tags';

describe('TAG_REGEX', () => {
  test('matches a basic topic and user', () => {
    const matches = [...'hello #work and @priya'.matchAll(TAG_REGEX)];
    expect(matches.map((m) => m[0])).toEqual(['#work', '@priya']);
  });

  test('matches hyphenated topics', () => {
    const matches = [...'see #q3-plan and #design-review'.matchAll(TAG_REGEX)];
    expect(matches.map((m) => m[0])).toEqual(['#q3-plan', '#design-review']);
  });

  test('does not match inside an email', () => {
    const matches = [...'reach me at name@example.com'.matchAll(TAG_REGEX)];
    expect(matches).toHaveLength(0);
  });

  test('does not match digits-prefixed tags', () => {
    const matches = [...'rev #1bad and good #q3-plan'.matchAll(TAG_REGEX)];
    expect(matches.map((m) => m[0])).toEqual(['#q3-plan']);
  });

  test('matches at start of string', () => {
    const matches = [...'#topic at start'.matchAll(TAG_REGEX)];
    expect(matches.map((m) => m[0])).toEqual(['#topic']);
  });

  test('matches inside markdown punctuation', () => {
    const matches = [...'see [#topic](url) and `@user`'.matchAll(TAG_REGEX)];
    expect(matches.map((m) => m[0])).toEqual(['#topic', '@user']);
  });
});

describe('extractTags', () => {
  test('returns ordered, deduplicated tags', () => {
    const out = extractTags('met @priya about #q3-plan; @priya signed off on #q3-plan');
    expect(out).toEqual([
      { type: 'user', name: 'priya', nameWhenLinked: 'priya' },
      { type: 'topic', name: 'q3-plan', nameWhenLinked: 'q3-plan' },
    ]);
  });

  test('lowercases name, preserves first literal in nameWhenLinked', () => {
    const out = extractTags('hi #Work and #WORK');
    expect(out).toEqual([{ type: 'topic', name: 'work', nameWhenLinked: 'Work' }]);
  });

  test('separates topic and user namespaces', () => {
    const out = extractTags('@work vs #work');
    expect(out).toEqual([
      { type: 'user', name: 'work', nameWhenLinked: 'work' },
      { type: 'topic', name: 'work', nameWhenLinked: 'work' },
    ]);
  });

  test('returns empty for body with no tags', () => {
    expect(extractTags('plain prose')).toEqual([]);
  });
});

describe('defaultInitials', () => {
  test('multi-word: first letter of first two words', () => {
    expect(defaultInitials('James Doe')).toBe('JD');
    expect(defaultInitials('work project alpha')).toBe('WP');
  });

  test('single word: first two letters', () => {
    expect(defaultInitials('work')).toBe('WO');
    expect(defaultInitials('a')).toBe('A');
  });

  test('hyphen + underscore as word separators', () => {
    expect(defaultInitials('q3-plan')).toBe('QP');
    expect(defaultInitials('design_review')).toBe('DR');
  });
});

describe('defaultColor', () => {
  test('deterministic — same input -> same colour', () => {
    expect(defaultColor('work')).toBe(defaultColor('work'));
  });

  test('returns a hex string from the palette', () => {
    expect(defaultColor('foo')).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('tagSigil', () => {
  test('maps types to sigils', () => {
    expect(tagSigil('topic')).toBe('#');
    expect(tagSigil('user')).toBe('@');
  });
});
