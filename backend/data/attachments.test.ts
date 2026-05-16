import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../db/migrate';
import {
  defaultAttachmentsDir,
  deleteAttachment,
  extFromMime,
  mimeFromExt,
  ORPHAN_MAX_AGE_MS,
  sweepOrphanAttachments,
  writeAttachment,
} from './attachments';

describe('defaultAttachmentsDir', () => {
  test('sibling of the db file', () => {
    expect(defaultAttachmentsDir('/tmp/jottapp/jottapp.db')).toBe('/tmp/jottapp/attachments');
  });
});

describe('extFromMime / mimeFromExt', () => {
  test('round-trips the supported types', () => {
    for (const mime of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ] as const) {
      const ext = extFromMime(mime);
      // jpg maps back to image/jpeg as the canonical form
      expect(mimeFromExt(ext)).toBe(mime);
    }
  });

  test('extFromMime falls back to bin for unknown', () => {
    expect(extFromMime('application/octet-stream')).toBe('bin');
  });

  test('mimeFromExt returns undefined for unknown', () => {
    expect(mimeFromExt('xyz')).toBeUndefined();
  });
});

describe('writeAttachment / deleteAttachment', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jott-att-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('writes bytes to <dir>/<id>.<ext> and returns the filename', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const filename = writeAttachment(dir, 'abc', 'png', bytes);
    expect(filename).toBe('abc.png');
    const written = readFileSync(join(dir, filename));
    expect(Array.from(written)).toEqual([1, 2, 3, 4]);
  });

  test('writeAttachment auto-creates the dir', () => {
    const nested = join(dir, 'nested', 'deep');
    writeAttachment(nested, 'x', 'png', new Uint8Array([9]));
    expect(existsSync(join(nested, 'x.png'))).toBe(true);
  });

  test('deleteAttachment removes the file', () => {
    writeAttachment(dir, 'x', 'png', new Uint8Array([9]));
    expect(existsSync(join(dir, 'x.png'))).toBe(true);
    deleteAttachment(dir, 'x.png');
    expect(existsSync(join(dir, 'x.png'))).toBe(false);
  });

  test('deleteAttachment tolerates missing files', () => {
    expect(() => deleteAttachment(dir, 'nope.png')).not.toThrow();
  });
});

describe('sweepOrphanAttachments', () => {
  let dir: string;
  let raw: Database;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jott-sweep-'));
    raw = new Database(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    migrate(raw);
  });
  afterEach(() => {
    raw.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function insertOrphan(id: string, createdAt: number): void {
    writeAttachment(dir, id, 'png', new Uint8Array([1]));
    raw.run(
      "INSERT INTO attachments (id, entry_id, kind, filename, mime, bytes, created_at) VALUES (?, NULL, 'image', ?, 'image/png', 1, ?)",
      [id, `${id}.png`, createdAt],
    );
  }

  test('deletes orphan rows and files older than the cutoff', () => {
    const now = 100_000_000;
    insertOrphan('old', now - ORPHAN_MAX_AGE_MS - 1);
    insertOrphan('young', now - 1_000);
    const swept = sweepOrphanAttachments(raw, dir, now);
    expect(swept).toBe(1);
    expect(existsSync(join(dir, 'old.png'))).toBe(false);
    expect(existsSync(join(dir, 'young.png'))).toBe(true);
    const remaining = raw.query('SELECT id FROM attachments').all() as Array<{ id: string }>;
    expect(remaining.map((r) => r.id)).toEqual(['young']);
  });

  test('returns 0 when no orphans match', () => {
    const now = 100_000_000;
    insertOrphan('young', now - 1_000);
    expect(sweepOrphanAttachments(raw, dir, now)).toBe(0);
  });
});
