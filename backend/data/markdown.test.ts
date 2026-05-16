import { describe, expect, test } from 'bun:test';
import { type ExportEntry, ImportParseError, parseEntries, serializeEntries } from './markdown';

const FIXTURES: ExportEntry[] = [
  {
    id: '01HXYZTEST0000000000000001',
    body: 'first entry with #tag and @mention',
    createdAt: Date.parse('2026-05-15T10:30:00.000Z'),
    updatedAt: Date.parse('2026-05-15T10:30:00.000Z'),
  },
  {
    id: '01HXYZTEST0000000000000002',
    body: 'second entry\n\nwith multiple\n\nparagraphs',
    createdAt: Date.parse('2026-05-15T11:00:00.000Z'),
    updatedAt: Date.parse('2026-05-15T11:05:00.000Z'),
  },
];

describe('serializeEntries', () => {
  test('emits a versioned header and per-entry markers', () => {
    const out = serializeEntries(FIXTURES, Date.parse('2026-05-16T00:00:00.000Z'));
    expect(out).toContain('<!-- jott v');
    expect(out).toContain('<!-- 2 entries -->');
    expect(out).toContain('<!-- @entry id="01HXYZTEST0000000000000001"');
    expect(out).toContain('<!-- @entry id="01HXYZTEST0000000000000002"');
    expect(out).toContain('first entry with #tag and @mention');
    expect(out).toContain('with multiple\n\nparagraphs');
  });

  test('uses singular noun for one entry', () => {
    const out = serializeEntries([FIXTURES[0] as ExportEntry], 0);
    expect(out).toContain('<!-- 1 entry -->');
  });

  test('zero entries still serialises a valid header', () => {
    const out = serializeEntries([], 0);
    expect(out).toContain('<!-- 0 entries -->');
  });
});

describe('parseEntries', () => {
  test('round-trips serialize → parse losslessly', () => {
    const text = serializeEntries(FIXTURES, Date.parse('2026-05-16T00:00:00.000Z'));
    const parsed = parseEntries(text);
    expect(parsed).toEqual(FIXTURES);
  });

  test('round-trips bodies containing horizontal rules (---)', () => {
    const withHr: ExportEntry = {
      id: '01HXYZTEST0000000000000099',
      body: 'before the rule\n\n---\n\nafter the rule',
      createdAt: 1_000,
      updatedAt: 1_000,
    };
    const text = serializeEntries([withHr], 0);
    const parsed = parseEntries(text);
    expect(parsed).toEqual([withHr]);
  });

  test('round-trips bodies with leading/trailing whitespace by trimming', () => {
    const noisy: ExportEntry = {
      id: '01HXYZTEST0000000000000003',
      body: 'clean body',
      createdAt: 1_000,
      updatedAt: 1_000,
    };
    const text = serializeEntries([{ ...noisy, body: '   \n\nclean body\n\n  ' }], 0);
    const parsed = parseEntries(text);
    expect(parsed).toEqual([noisy]);
  });

  test('ignores preamble before the first marker', () => {
    const text = [
      '<!-- jott v0.0.0 export ... -->',
      '<!-- 1 entry -->',
      '',
      'random garbage that should be ignored',
      '',
      '<!-- @entry id="01H" created="2026-05-15T10:30:00.000Z" updated="2026-05-15T10:30:00.000Z" -->',
      '',
      'the body',
    ].join('\n');
    const parsed = parseEntries(text);
    expect(parsed).toEqual([
      {
        id: '01H',
        body: 'the body',
        createdAt: Date.parse('2026-05-15T10:30:00.000Z'),
        updatedAt: Date.parse('2026-05-15T10:30:00.000Z'),
      },
    ]);
  });

  test('returns empty array for input with no markers', () => {
    expect(parseEntries('# heading\n\nno markers here')).toEqual([]);
  });

  test('throws ImportParseError with line numbers for malformed markers', () => {
    const bad = ['<!-- @entry id="01H" created="2026-05-15T10:30:00.000Z" -->', 'body'].join('\n');
    let thrown: unknown;
    try {
      parseEntries(bad);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ImportParseError);
    expect((thrown as ImportParseError).errors[0]?.line).toBe(1);
  });

  test('throws on invalid date in marker', () => {
    const bad = ['<!-- @entry id="01H" created="not-a-date" updated="also-not" -->', 'body'].join(
      '\n',
    );
    expect(() => parseEntries(bad)).toThrow(ImportParseError);
  });

  test('accepts CRLF line endings', () => {
    const text = serializeEntries([FIXTURES[0] as ExportEntry], 0).replaceAll('\n', '\r\n');
    expect(parseEntries(text)).toEqual([FIXTURES[0] as ExportEntry]);
  });
});
