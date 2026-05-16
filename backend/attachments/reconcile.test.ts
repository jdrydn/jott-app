import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { ulid } from 'ulid';
import { writeAttachment } from '../data/attachments';
import { migrate } from '../db/migrate';
import * as schema from '../db/schema';
import { attachments, entries } from '../db/schema';
import { extractAttachmentIds, reconcileEntryAttachments } from './reconcile';

type Setup = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  raw: Database;
  dir: string;
  workdir: string;
  cleanup: () => void;
};

function setup(): Setup {
  const workdir = mkdtempSync(join(tmpdir(), 'jott-reconcile-'));
  const raw = new Database(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  migrate(raw);
  const db = drizzle(raw, { schema });
  return {
    db,
    raw,
    dir: workdir,
    workdir,
    cleanup: () => {
      raw.close();
      rmSync(workdir, { recursive: true, force: true });
    },
  };
}

function insertEntry(db: Setup['db'], body: string): string {
  const id = ulid();
  const now = Date.now();
  db.insert(entries).values({ id, body, createdAt: now, updatedAt: now }).run();
  return id;
}

function insertOrphanAttachment(s: Setup, id: string): string {
  writeAttachment(s.dir, id, 'png', new Uint8Array([1, 2, 3]));
  s.db
    .insert(attachments)
    .values({
      id,
      entryId: null,
      kind: 'image',
      filename: `${id}.png`,
      mime: 'image/png',
      bytes: 3,
      createdAt: Date.now(),
    })
    .run();
  return id;
}

describe('extractAttachmentIds', () => {
  test('finds unique 26-char ULIDs in /api/attachments/ urls', () => {
    const a = ulid();
    const b = ulid();
    const body = `before ![](/api/attachments/${a}) ![](/api/attachments/${b}) ![](/api/attachments/${a})`;
    expect(extractAttachmentIds(body)).toEqual([a, b]);
  });

  test('ignores non-attachment urls', () => {
    expect(extractAttachmentIds('![](https://example.com/foo.png)')).toEqual([]);
  });
});

describe('reconcileEntryAttachments', () => {
  let s: Setup;
  beforeEach(() => {
    s = setup();
  });
  afterEach(() => {
    s.cleanup();
  });

  test('binds orphan rows referenced in body', () => {
    const aid = insertOrphanAttachment(s, ulid());
    const entryId = insertEntry(s.db, `text ![](/api/attachments/${aid}) more`);

    const result = reconcileEntryAttachments(
      s.db,
      s.dir,
      entryId,
      `text ![](/api/attachments/${aid}) more`,
    );

    expect(result).toEqual({ bound: 1, removed: 0 });
    const row = s.db.select().from(attachments).all()[0];
    expect(row?.entryId).toBe(entryId);
  });

  test('removes attachments + files no longer referenced', () => {
    const aid = insertOrphanAttachment(s, ulid());
    const entryId = insertEntry(s.db, `keep ![](/api/attachments/${aid})`);

    reconcileEntryAttachments(s.db, s.dir, entryId, `keep ![](/api/attachments/${aid})`);
    expect(s.db.select().from(attachments).all()).toHaveLength(1);

    // Edit removes the image.
    const res = reconcileEntryAttachments(s.db, s.dir, entryId, 'keep');
    expect(res).toEqual({ bound: 0, removed: 1 });
    expect(s.db.select().from(attachments).all()).toHaveLength(0);
    expect(existsSync(join(s.dir, `${aid}.png`))).toBe(false);
  });

  test('is a no-op when body has no attachment URLs and entry has none', () => {
    const entryId = insertEntry(s.db, 'plain text');
    const res = reconcileEntryAttachments(s.db, s.dir, entryId, 'plain text');
    expect(res).toEqual({ bound: 0, removed: 0 });
  });

  test('binds multiple referenced orphans in one pass', () => {
    const a = insertOrphanAttachment(s, ulid());
    const b = insertOrphanAttachment(s, ulid());
    const entryId = insertEntry(s.db, `![](/api/attachments/${a}) ![](/api/attachments/${b})`);

    const res = reconcileEntryAttachments(
      s.db,
      s.dir,
      entryId,
      `![](/api/attachments/${a}) ![](/api/attachments/${b})`,
    );
    expect(res).toEqual({ bound: 2, removed: 0 });
  });

  test('does not re-bind rows already linked to a different entry', () => {
    const a = insertOrphanAttachment(s, ulid());
    const e1 = insertEntry(s.db, `![](/api/attachments/${a})`);
    reconcileEntryAttachments(s.db, s.dir, e1, `![](/api/attachments/${a})`);

    // Second entry references same id; bind should not move it.
    const e2 = insertEntry(s.db, `![](/api/attachments/${a})`);
    const res = reconcileEntryAttachments(s.db, s.dir, e2, `![](/api/attachments/${a})`);
    expect(res.bound).toBe(0);
    const row = s.db.select().from(attachments).all()[0];
    expect(row?.entryId).toBe(e1);
  });
});
