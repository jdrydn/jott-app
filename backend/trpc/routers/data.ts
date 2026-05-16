import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';
import { reconcileEntryAttachments } from '../../attachments/reconcile';
import {
  decodeDataUris,
  extFromMime,
  readAttachmentAsDataUri,
  writeAttachment,
} from '../../data/attachments';
import { BackupNotSupportedError, backupDb, defaultBackupDir } from '../../data/backup';
import {
  bodyMarkersFromExport,
  type ExportTag,
  ImportParseError,
  parseEntries,
  serializeEntries,
} from '../../data/markdown';
import { attachments, entries, settings, tags } from '../../db/schema';
import { reconcileEntryTags } from '../../tags/reconcile';
import type { Context } from '../context';
import { publicProcedure, router } from '../trpc';
import { SETTING_DEFAULTS, type SettingKey } from './settings';

export type ExportResult = {
  filename: string;
  text: string;
  count: number;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  total: number;
};

export type BackupApiResult = {
  path: string;
  bytes: number;
};

const importInput = z.object({
  text: z.string().min(1).max(50_000_000),
});

const BACKUP_KEYS: SettingKey[] = ['backup.onQuit', 'backup.dir'];

function readBackupDir(ctx: Context): string {
  const rows = ctx.db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, BACKUP_KEYS as unknown as string[]))
    .all();
  const dir = rows.find((r) => r.key === 'backup.dir')?.value ?? SETTING_DEFAULTS['backup.dir'];
  return dir;
}

function exportFilename(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `jottapp-export-${y}-${m}-${d}.md`;
}

export const dataRouter = router({
  exportMarkdown: publicProcedure.query(({ ctx }): ExportResult => {
    const rows = ctx.db
      .select()
      .from(entries)
      .where(isNull(entries.deletedAt))
      .orderBy(asc(entries.createdAt))
      .all();
    const now = Date.now();

    const linked = rows.length
      ? ctx.db
          .select({
            id: attachments.id,
            entryId: attachments.entryId,
            filename: attachments.filename,
            mime: attachments.mime,
          })
          .from(attachments)
          .where(
            inArray(
              attachments.entryId,
              rows.map((r) => r.id),
            ),
          )
          .all()
      : [];
    const byId = new Map(linked.map((a) => [a.id, a]));

    const embedded = rows.map((r) => {
      if (!r.body.includes('/api/attachments/')) return r;
      const body = r.body.replace(/\/api\/attachments\/([0-9A-HJKMNP-TV-Z]{26})/g, (orig, id) => {
        const att = byId.get(id);
        if (!att) return orig;
        return readAttachmentAsDataUri(ctx.attachmentsDir, att.filename, att.mime);
      });
      return { ...r, body };
    });

    // Only include tags referenced by exported entries — keeps the table tight
    // and avoids leaking soft-deleted-only tags.
    const referencedIds = new Set<string>();
    const REF_RE = /\{\{\s*tag\s+id=([0-9A-HJKMNP-TV-Z]{26})\s*\}\}/g;
    for (const r of embedded) {
      for (const m of r.body.matchAll(REF_RE)) {
        if (m[1]) referencedIds.add(m[1]);
      }
    }
    const tagRows: ExportTag[] = referencedIds.size
      ? ctx.db
          .select({
            id: tags.id,
            type: tags.type,
            name: tags.name,
            initials: tags.initials,
            color: tags.color,
          })
          .from(tags)
          .where(inArray(tags.id, [...referencedIds]))
          .all()
      : [];

    const text = serializeEntries(embedded, tagRows, now);
    return { filename: exportFilename(new Date(now)), text, count: rows.length };
  }),

  importMarkdown: publicProcedure.input(importInput).mutation(({ ctx, input }): ImportResult => {
    let parsed: ReturnType<typeof parseEntries>;
    try {
      parsed = parseEntries(input.text);
    } catch (err) {
      if (err instanceof ImportParseError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
      }
      throw err;
    }

    if (parsed.entries.length === 0) {
      return { imported: 0, skipped: 0, total: 0 };
    }

    const existingIds = new Set(
      ctx.db
        .select({ id: entries.id })
        .from(entries)
        .where(
          inArray(
            entries.id,
            parsed.entries.map((p) => p.id),
          ),
        )
        .all()
        .map((r) => r.id),
    );

    let imported = 0;
    let skipped = 0;

    ctx.db.transaction((tx) => {
      // Upsert tags from the Tags table first so reconcile in the entry loop
      // can resolve markers back to live rows.
      const now = Date.now();
      for (const t of parsed.tags) {
        const existing = tx.select().from(tags).where(eq(tags.id, t.id)).get();
        if (existing) {
          tx.update(tags)
            .set({
              type: t.type,
              name: t.name,
              initials: t.initials,
              color: t.color,
              updatedAt: now,
            })
            .where(eq(tags.id, t.id))
            .run();
          continue;
        }
        // Resolve `(type, name)` collisions by appending a suffix — the import
        // takes precedence on id, but we can't break the uniqueness index.
        let name = t.name;
        for (let i = 2; i < 1000; i++) {
          const clash = tx
            .select()
            .from(tags)
            .where(and(eq(tags.type, t.type), eq(tags.name, name)))
            .get();
          if (!clash) break;
          name = `${t.name} (${i})`;
        }
        tx.insert(tags)
          .values({
            id: t.id,
            type: t.type,
            name,
            initials: t.initials,
            color: t.color,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      for (const e of parsed.entries) {
        if (existingIds.has(e.id)) {
          skipped++;
          continue;
        }
        const decoded = decodeDataUris(e.body);
        // Strip `@name <!-- Tag: ULID -->` patterns down to canonical markers
        // before any further processing.
        let body = bodyMarkersFromExport(e.body);
        const newAttachments: Array<{ id: string; mime: string; bytes: number }> = [];
        for (const d of decoded) {
          const id = ulid();
          const ext = extFromMime(d.mime);
          writeAttachment(ctx.attachmentsDir, id, ext, d.bytes);
          body = body.replace(d.match, `/api/attachments/${id}`);
          newAttachments.push({ id, mime: d.mime, bytes: d.bytes.byteLength });
        }

        tx.insert(entries)
          .values({
            id: e.id,
            body,
            bodyRendered: '',
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          })
          .run();
        for (const a of newAttachments) {
          tx.insert(attachments)
            .values({
              id: a.id,
              entryId: e.id,
              kind: 'image',
              filename: `${a.id}.${extFromMime(a.mime)}`,
              mime: a.mime,
              bytes: a.bytes,
              createdAt: e.updatedAt,
            })
            .run();
        }
        reconcileEntryTags(tx, e.id, body, e.updatedAt);
        // Run attachments reconcile to keep counts consistent (also covers any
        // pre-existing /api/attachments/<id> URLs in the import that map to
        // attachments imported above).
        reconcileEntryAttachments(tx, ctx.attachmentsDir, e.id, body);
        imported++;
      }
    });

    return { imported, skipped, total: parsed.entries.length };
  }),

  backup: publicProcedure.mutation(({ ctx }): BackupApiResult => {
    const dir = readBackupDir(ctx);
    try {
      return backupDb(ctx.raw, ctx.dbPath, { dir });
    } catch (err) {
      if (err instanceof BackupNotSupportedError) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
      }
      throw err;
    }
  }),

  backupDirPreview: publicProcedure.query(({ ctx }): { resolved: string; isDefault: boolean } => {
    const configured = readBackupDir(ctx);
    if (configured.trim() === '') {
      return { resolved: defaultBackupDir(ctx.dbPath), isDefault: true };
    }
    return { resolved: configured, isDefault: false };
  }),
});
