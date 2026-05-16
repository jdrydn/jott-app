import type { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml';

export const ALLOWED_IMAGE_MIMES: readonly ImageMime[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function defaultAttachmentsDir(dbPath: string): string {
  return join(dirname(dbPath), 'attachments');
}

export function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

export function mimeFromExt(ext: string): string | undefined {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return undefined;
  }
}

export function writeAttachment(dir: string, id: string, ext: string, bytes: Uint8Array): string {
  mkdirSync(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  writeFileSync(join(dir, filename), bytes);
  return filename;
}

export function readAttachmentPath(dir: string, filename: string): string {
  return join(dir, filename);
}

export function deleteAttachment(dir: string, filename: string): void {
  try {
    unlinkSync(join(dir, filename));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export function attachmentSizeOrZero(dir: string, filename: string): number {
  try {
    return statSync(join(dir, filename)).size;
  } catch {
    return 0;
  }
}

export function encodeDataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

export function readAttachmentAsDataUri(dir: string, filename: string, mime: string): string {
  const bytes = readFileSync(join(dir, filename));
  return encodeDataUri(mime, new Uint8Array(bytes));
}

export type DecodedDataUri = {
  match: string;
  mime: string;
  bytes: Uint8Array;
};

export const DATA_URI_RE = /data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)/g;

export function decodeDataUris(body: string): DecodedDataUri[] {
  const out: DecodedDataUri[] = [];
  for (const m of body.matchAll(DATA_URI_RE)) {
    const mime = m[1];
    const base64 = m[2];
    if (!mime || !base64) continue;
    out.push({
      match: m[0],
      mime,
      bytes: new Uint8Array(Buffer.from(base64, 'base64')),
    });
  }
  return out;
}

export const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function sweepOrphanAttachments(
  raw: Database,
  dir: string,
  now: number = Date.now(),
  maxAgeMs: number = ORPHAN_MAX_AGE_MS,
): number {
  const cutoff = now - maxAgeMs;
  const rows = raw
    .query('SELECT id, filename FROM attachments WHERE entry_id IS NULL AND created_at < ?')
    .all(cutoff) as Array<{ id: string; filename: string }>;
  if (rows.length === 0) return 0;
  const del = raw.query('DELETE FROM attachments WHERE id = ?');
  for (const r of rows) {
    del.run(r.id);
    deleteAttachment(dir, r.filename);
  }
  return rows.length;
}
