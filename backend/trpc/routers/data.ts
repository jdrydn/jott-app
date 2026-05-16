import { TRPCError } from '@trpc/server';
import { asc, inArray, isNull } from 'drizzle-orm';
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
import { ImportParseError, parseEntries, serializeEntries } from '../../data/markdown';
import { attachments, entries, settings } from '../../db/schema';
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

    const text = serializeEntries(embedded, now);
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

    if (parsed.length === 0) {
      return { imported: 0, skipped: 0, total: 0 };
    }

    const existingIds = new Set(
      ctx.db
        .select({ id: entries.id })
        .from(entries)
        .where(
          inArray(
            entries.id,
            parsed.map((p) => p.id),
          ),
        )
        .all()
        .map((r) => r.id),
    );

    let imported = 0;
    let skipped = 0;

    ctx.db.transaction((tx) => {
      for (const e of parsed) {
        if (existingIds.has(e.id)) {
          skipped++;
          continue;
        }
        const decoded = decodeDataUris(e.body);
        let body = e.body;
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

    return { imported, skipped, total: parsed.length };
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
