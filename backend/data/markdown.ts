import { VERSION } from '@shared/version';

export type ExportEntry = {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

const ENTRY_MARKER = '<!-- @entry';
const MARKER_RE = /^<!-- @entry id="([^"]+)" created="([^"]+)" updated="([^"]+)" -->$/;

export function serializeEntries(rows: ExportEntry[], now: number = Date.now()): string {
  const noun = rows.length === 1 ? 'entry' : 'entries';
  const header = [
    `<!-- jott v${VERSION} export ${new Date(now).toISOString()} -->`,
    `<!-- ${rows.length} ${noun} -->`,
  ];
  const blocks = rows.map((e) => {
    const marker =
      `${ENTRY_MARKER} ` +
      `id="${e.id}" ` +
      `created="${new Date(e.createdAt).toISOString()}" ` +
      `updated="${new Date(e.updatedAt).toISOString()}" -->`;
    return `${marker}\n\n${e.body.trim()}\n`;
  });
  return `${header.join('\n')}\n\n${blocks.join('\n')}`;
}

export type ParseError = { line: number; message: string };

export class ImportParseError extends Error {
  constructor(public readonly errors: ParseError[]) {
    super(errors.map((e) => `line ${e.line}: ${e.message}`).join('; '));
    this.name = 'ImportParseError';
  }
}

export function parseEntries(text: string): ExportEntry[] {
  const lines = text.split(/\r?\n/);
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
  return out;
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
