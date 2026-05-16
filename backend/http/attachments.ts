import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { ulid } from 'ulid';
import {
  ALLOWED_IMAGE_MIMES,
  extFromMime,
  type ImageMime,
  MAX_ATTACHMENT_BYTES,
  readAttachmentPath,
  writeAttachment,
} from '../data/attachments';
import type { Db } from '../db/client';
import { attachments } from '../db/schema';

export type AttachmentsDeps = {
  db: Db;
  dir: string;
};

function isAllowedMime(m: string): m is ImageMime {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(m);
}

function parseIntOrUndefined(v: FormDataEntryValue | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(typeof v === 'string' ? v : v.name);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export function mountAttachmentsRoutes(app: Hono, deps: AttachmentsDeps): void {
  app.post('/api/attachments', async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'expected multipart/form-data' }, 400);
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      return c.json({ error: "missing 'file' field" }, 400);
    }
    if (file.size === 0) {
      return c.json({ error: 'empty file' }, 400);
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return c.json({ error: `file exceeds ${MAX_ATTACHMENT_BYTES} bytes` }, 413);
    }
    const mime = file.type;
    if (!isAllowedMime(mime)) {
      return c.json({ error: `unsupported mime type: ${mime || 'unknown'}` }, 415);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = ulid();
    const ext = extFromMime(mime);
    const filename = writeAttachment(deps.dir, id, ext, bytes);
    const width = parseIntOrUndefined(form.get('width'));
    const height = parseIntOrUndefined(form.get('height'));

    deps.db
      .insert(attachments)
      .values({
        id,
        entryId: null,
        kind: 'image',
        filename,
        mime,
        bytes: bytes.byteLength,
        width: width ?? null,
        height: height ?? null,
        createdAt: Date.now(),
      })
      .run();

    return c.json({
      id,
      url: `/api/attachments/${id}`,
      mime,
      bytes: bytes.byteLength,
      width: width ?? null,
      height: height ?? null,
    });
  });

  app.get('/api/attachments/:id', (c) => {
    const id = c.req.param('id');
    const row = deps.db
      .select({ filename: attachments.filename, mime: attachments.mime })
      .from(attachments)
      .where(eq(attachments.id, id))
      .get();
    if (!row) return c.notFound();
    const path = readAttachmentPath(deps.dir, row.filename);
    const file = Bun.file(path);
    return new Response(file, {
      headers: {
        'content-type': row.mime,
        'cache-control': 'private, max-age=31536000, immutable',
      },
    });
  });
}
