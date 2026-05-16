import { formatTagRef, TAG_REF_REGEX, type TagType } from '@shared/tags';
import { VERSION } from '@shared/version';

export type ExportEntry = {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type ExportTag = {
  id: string;
  type: TagType;
  name: string;
  initials: string;
  color: string;
};

export type ExportPayload = {
  entries: ExportEntry[];
  tags: ExportTag[];
};

const ENTRY_MARKER = '<!-- @entry';
const MARKER_RE = /^<!-- @entry id="([^"]+)" created="([^"]+)" updated="([^"]+)" -->$/;
const TAGS_SECTION = '<!-- @tags -->';
// `@name <!-- Tag: ULID -->` — bound to a single line. The `name` part may
// contain spaces but not a `<` (which would start the comment). The comment
// payload is the canonical ULID; the visible `@name`/`#name` is for humans.
const TAG_COMMENT_RE = /([#@])([^\s<][^<]*?)\s*<!-- Tag:\s*([0-9A-HJKMNP-TV-Z]{26})\s*-->/g;

export function serializeEntries(
  rows: ExportEntry[],
  tags: ExportTag[] = [],
  now: number = Date.now(),
): string {
  const noun = rows.length === 1 ? 'entry' : 'entries';
  const header = [
    `<!-- jott v${VERSION} export ${new Date(now).toISOString()} -->`,
    `<!-- ${rows.length} ${noun} -->`,
  ];

  const byId = new Map(tags.map((t) => [t.id, t]));
  const blocks = rows.map((e) => {
    const marker =
      `${ENTRY_MARKER} ` +
      `id="${e.id}" ` +
      `created="${new Date(e.createdAt).toISOString()}" ` +
      `updated="${new Date(e.updatedAt).toISOString()}" -->`;
    return `${marker}\n\n${renderBodyForExport(e.body, byId).trim()}\n`;
  });

  let out = `${header.join('\n')}\n\n${blocks.join('\n')}`;
  if (tags.length > 0) {
    out += `\n${TAGS_SECTION}\n\n${renderTagsTable(tags)}\n`;
  }
  return out;
}

// Replace `{{ tag id=ULID }}` markers with `@name <!-- Tag: ULID -->` so the
// export reads naturally while still carrying the canonical id for re-import.
function renderBodyForExport(body: string, byId: ReadonlyMap<string, ExportTag>): string {
  return body.replace(TAG_REF_REGEX, (full, id: string) => {
    const tag = byId.get(id);
    if (!tag) return full;
    const sigil = tag.type === 'topic' ? '#' : '@';
    return `${sigil}${tag.name} <!-- Tag: ${id} -->`;
  });
}

function renderTagsTable(tags: ExportTag[]): string {
  const rows = tags.map((t) => `| ${t.id} | ${t.type} | ${t.name} | ${t.initials} | ${t.color} |`);
  return [
    '| id | type | name | initials | color |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export type ParseError = { line: number; message: string };

export class ImportParseError extends Error {
  constructor(public readonly errors: ParseError[]) {
    super(errors.map((e) => `line ${e.line}: ${e.message}`).join('; '));
    this.name = 'ImportParseError';
  }
}

export function parseEntries(text: string): ExportPayload {
  const tagsIdx = text.indexOf(`\n${TAGS_SECTION}`);
  const entriesText = tagsIdx >= 0 ? text.slice(0, tagsIdx) : text;
  const tagsText = tagsIdx >= 0 ? text.slice(tagsIdx + TAGS_SECTION.length + 1) : '';

  const lines = entriesText.split(/\r?\n/);
  const out: ExportEntry[] = [];
  const errors: ParseError[] = [];

  type Pending = {
    id: string;
    createdAt: number;
    updatedAt: number;
    bodyLines: string[];
  };
  let current: Pending | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith(ENTRY_MARKER)) {
      if (current) out.push(finalize(current));
      const m = MARKER_RE.exec(line);
      if (!m) {
        errors.push({ line: i + 1, message: `malformed entry marker: ${line}` });
        current = null;
        continue;
      }
      const [, id, created, updated] = m;
      const createdAt = Date.parse(created ?? '');
      const updatedAt = Date.parse(updated ?? '');
      if (Number.isNaN(createdAt) || Number.isNaN(updatedAt)) {
        errors.push({ line: i + 1, message: `invalid date in entry marker for id ${id}` });
        current = null;
        continue;
      }
      current = { id: id ?? '', createdAt, updatedAt, bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) out.push(finalize(current));

  if (errors.length > 0) throw new ImportParseError(errors);

  const tags = parseTagsTable(tagsText);
  return { entries: out, tags };
}

function parseTagsTable(text: string): ExportTag[] {
  if (text.trim() === '') return [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  const out: ExportTag[] = [];
  for (const line of lines) {
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length !== 5) continue;
    const [id, type, name, initials, color] = cells;
    // Skip the header and separator rows.
    if (id === 'id' || (id ?? '').startsWith('---')) continue;
    if (!id || !name || !initials || !color) continue;
    if (type !== 'topic' && type !== 'user') continue;
    out.push({ id, type, name, initials, color });
  }
  return out;
}

// Convert export-style `@name <!-- Tag: ULID -->` patterns back to canonical
// `{{ tag id=ULID }}` markers so the reconciler sees a clean ref shape on
// import.
export function bodyMarkersFromExport(body: string): string {
  return body.replace(TAG_COMMENT_RE, (_full, _sigil, _name, id: string) => formatTagRef(id));
}

function finalize(p: {
  id: string;
  createdAt: number;
  updatedAt: number;
  bodyLines: string[];
}): ExportEntry {
  const body = p.bodyLines
    .join('\n')
    .replace(/^\s*\n+/, '')
    .replace(/\s+$/, '');
  return { id: p.id, body, createdAt: p.createdAt, updatedAt: p.updatedAt };
}
