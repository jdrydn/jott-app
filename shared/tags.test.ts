import { describe, expect, test } from 'bun:test';
import {
  defaultColor,
  defaultInitials,
  extractBareTags,
  extractTagRefs,
  formatTagRef,
  renderBody,
  TAG_REF_REGEX,
  TAG_REGEX,
  tagSigil,
} from './tags';

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

describe('TAG_REF_REGEX', () => {
  test('matches a canonical ULID marker', () => {
    const id = '01H4G9X8Y7Z6V5T4S3R2Q1P0N9';
    const matches = [...`hi ${formatTagRef(id)} there`.matchAll(TAG_REF_REGEX)];
    expect(matches.map((m) => m[1])).toEqual([id]);
  });

  test('matches multiple markers in one body', () => {
    const a = '01H4G9X8Y7Z6V5T4S3R2Q1P0N9';
    const b = '01H4G9X8Y7Z6V5T4S3R2Q1P0NA';
    const body = `${formatTagRef(a)} then ${formatTagRef(b)}`;
    expect(extractTagRefs(body)).toEqual([a, b]);
  });

  test('does not match invalid id payloads', () => {
    expect(extractTagRefs('{{ tag id=NOTULID }}')).toEqual([]);
    expect(extractTagRefs('{{ tag id= }}')).toEqual([]);
  });
});

describe('extractBareTags', () => {
  test('returns ordered, deduplicated tags', () => {
    const out = extractBareTags('met @priya about #q3-plan; @priya signed off on #q3-plan');
    expect(out).toEqual([
      { type: 'user', name: 'priya' },
      { type: 'topic', name: 'q3-plan' },
    ]);
  });

  test('lowercases name regardless of input casing', () => {
    const out = extractBareTags('hi #Work and #WORK');
    expect(out).toEqual([{ type: 'topic', name: 'work' }]);
  });

  test('separates topic and user namespaces', () => {
    const out = extractBareTags('@work vs #work');
    expect(out).toEqual([
      { type: 'user', name: 'work' },
      { type: 'topic', name: 'work' },
    ]);
  });

  test('returns empty for body with no tags', () => {
    expect(extractBareTags('plain prose')).toEqual([]);
  });
});

describe('renderBody', () => {
  test('replaces markers with @name / #name from the lookup', () => {
    const a = '01H4G9X8Y7Z6V5T4S3R2Q1P0N9';
    const b = '01H4G9X8Y7Z6V5T4S3R2Q1P0NA';
    const lookup = new Map([
      [a, { type: 'user' as const, name: 'priya' }],
      [b, { type: 'topic' as const, name: 'q3-plan' }],
    ]);
    const body = `met ${formatTagRef(a)} about ${formatTagRef(b)}`;
    expect(renderBody(body, lookup)).toBe('met @priya about #q3-plan');
  });

  test('leaves unknown ids as literal marker text', () => {
    const id = '01H4G9X8Y7Z6V5T4S3R2Q1P0N9';
    const body = `lost ${formatTagRef(id)} ref`;
    expect(renderBody(body, new Map())).toBe(body);
  });

  test('passes plain text through untouched', () => {
    expect(renderBody('no markers here', new Map())).toBe('no markers here');
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
