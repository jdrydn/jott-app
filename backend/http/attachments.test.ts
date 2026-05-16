import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Hono } from 'hono';
import { MAX_ATTACHMENT_BYTES } from '../data/attachments';
import { migrate } from '../db/migrate';
import * as schema from '../db/schema';
import { mountAttachmentsRoutes } from './attachments';

type Setup = {
  app: Hono;
  raw: Database;
  dir: string;
  cleanup: () => void;
};

function setup(): Setup {
  const dir = mkdtempSync(join(tmpdir(), 'jott-http-att-'));
  const raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  const app = new Hono();
  mountAttachmentsRoutes(app, { db, dir });
  return {
    app,
    raw,
    dir,
    cleanup: () => {
      raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function pngRequest(bytes: Uint8Array): Request {
  const form = new FormData();
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  form.append('file', new File([ab], 'a.png', { type: 'image/png' }));
  return new Request('http://localhost/api/attachments', { method: 'POST', body: form });
}

describe('POST /api/attachments', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });
  afterEach(() => {
    s.cleanup();
  });

  test('uploads a png and returns metadata', async () => {
    const res = await s.app.fetch(pngRequest(new Uint8Array([0x89, 0x50, 0x4e, 0x47])));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; url: string; mime: string; bytes: number };
    expect(body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(body.url).toBe(`/api/attachments/${body.id}`);
    expect(body.mime).toBe('image/png');
    expect(body.bytes).toBe(4);
  });

  test('rejects oversize uploads with 413', async () => {
    const big = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
    const res = await s.app.fetch(pngRequest(big));
    expect(res.status).toBe(413);
  });

  test('rejects unsupported mimes with 415', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1])], 'x.txt', { type: 'text/plain' }));
    const res = await s.app.fetch(
      new Request('http://localhost/api/attachments', { method: 'POST', body: form }),
    );
    expect(res.status).toBe(415);
  });

  test('rejects missing file field with 400', async () => {
    const form = new FormData();
    const res = await s.app.fetch(
      new Request('http://localhost/api/attachments', { method: 'POST', body: form }),
    );
    expect(res.status).toBe(400);
  });

  test('rejects empty file with 400', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(0)], 'a.png', { type: 'image/png' }));
    const res = await s.app.fetch(
      new Request('http://localhost/api/attachments', { method: 'POST', body: form }),
    );
    expect(res.status).toBe(400);
  });

  test('stores width/height when supplied', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2])], 'a.png', { type: 'image/png' }));
    form.append('width', '640');
    form.append('height', '480');
    const res = await s.app.fetch(
      new Request('http://localhost/api/attachments', { method: 'POST', body: form }),
    );
    const body = (await res.json()) as { width: number; height: number };
    expect(body.width).toBe(640);
    expect(body.height).toBe(480);
  });
});

describe('GET /api/attachments/:id', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });
  afterEach(() => {
    s.cleanup();
  });

  test('streams the uploaded bytes back with the stored mime', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const post = await s.app.fetch(pngRequest(data));
    const { id } = (await post.json()) as { id: string };

    const res = await s.app.fetch(new Request(`http://localhost/api/attachments/${id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('immutable');
    const got = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(got)).toEqual(Array.from(data));
  });

  test('404s on unknown id', async () => {
    const res = await s.app.fetch(new Request('http://localhost/api/attachments/01HXXX'));
    expect(res.status).toBe(404);
  });
});
