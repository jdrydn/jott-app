import type { EntryWithTags } from '@backend/trpc/routers/entries';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { type DayGroup, formatTime, groupByDay } from '../lib/format';
import { MarkdownView } from '../lib/markdown/MarkdownView';
import { trpc } from '../trpc';
import { JottEditor, type JottEditorHandle } from './JottEditor';
import { useToast } from './Toast';

export function EntryFeed({ trash = false }: { trash?: boolean }) {
  const list = trpc.entries.list.useQuery({ trash });

  if (list.isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (list.error) {
    return <p className="text-sm text-red-500">Error: {list.error.message}</p>;
  }

  const groups = groupByDay(list.data ?? []);

  if (trash && groups.every((g) => g.entries.length === 0)) {
    return <p className="text-sm italic text-gray-400">Trash is empty.</p>;
  }

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <DaySection key={group.dateKey} group={group} trash={trash} />
      ))}
    </div>
  );
}

function DaySection({ group, trash }: { group: DayGroup; trash: boolean }) {
  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between border-b border-gray-200 pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            {group.label}
          </span>
          <span className="text-xs text-gray-400">{group.dateFormatted}</span>
        </div>
        {group.entries.length > 0 ? (
          <span className="text-xs text-gray-400">
            {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
          </span>
        ) : null}
      </header>
      {group.entries.length === 0 ? (
        <p className="text-sm italic text-gray-400">Nothing yet. Type above to start.</p>
      ) : (
        <ul className="space-y-5">
          {group.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} trash={trash} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryRow({ entry, trash }: { entry: EntryWithTags; trash: boolean }) {
  const [editing, setEditing] = useState(false);
  const utils = trpc.useUtils();
  const toast = useToast();

  const restore = trpc.entries.restore.useMutation({
    onSuccess: () => {
      utils.entries.list.invalidate();
    },
  });

  const del = trpc.entries.delete.useMutation({
    onSuccess: (deleted) => {
      utils.entries.list.invalidate();
      toast.push('Entry deleted', {
        label: 'Undo',
        onClick: () => restore.mutate({ id: deleted.id }),
      });
    },
  });

  const muted = trash ? 'opacity-60' : '';

  return (
    <li className={`group flex gap-6 ${muted}`}>
      <span className="mt-0.5 w-12 shrink-0 font-mono text-xs text-gray-400">
        {formatTime(entry.createdAt)}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {editing ? (
          <EntryEditor entry={entry} onDone={() => setEditing(false)} />
        ) : (
          <MarkdownView body={entry.body} links={entry.tags} />
        )}
      </div>
      <div className="flex w-16 shrink-0 items-start justify-end gap-1 self-start opacity-0 transition-opacity group-hover:opacity-100">
        {editing ? null : trash ? (
          <RowAction
            onClick={() => restore.mutate({ id: entry.id })}
            title="Restore entry"
            disabled={restore.isPending}
          >
            <RestoreIcon />
          </RowAction>
        ) : (
          <>
            <RowAction onClick={() => setEditing(true)} title="Edit entry">
              <PencilIcon />
            </RowAction>
            <RowAction
              onClick={() => del.mutate({ id: entry.id })}
              title="Delete entry"
              disabled={del.isPending}
            >
              <TrashIcon />
            </RowAction>
          </>
        )}
      </div>
    </li>
  );
}

function RowAction({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function EntryEditor({ entry, onDone }: { entry: EntryWithTags; onDone: () => void }) {
  const editorRef = useRef<JottEditorHandle>(null);
  const utils = trpc.useUtils();
  const update = trpc.entries.update.useMutation({
    onSuccess: () => {
      utils.entries.list.invalidate();
      utils.tags.list.invalidate();
      onDone();
    },
  });

  const save = useCallback(
    (md: string) => {
      const body = md.trim();
      if (!body || update.isPending) return;
      if (body === entry.body) {
        onDone();
        return;
      }
      update.mutate({ id: entry.id, body });
    },
    [entry.id, entry.body, update, onDone],
  );

  const cancel = useCallback(() => onDone(), [onDone]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 ring-2 ring-slate-100">
      <JottEditor
        ref={editorRef}
        initialBody={entry.body}
        autoFocus="end"
        onSubmit={save}
        onCancel={cancel}
      />
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-3 py-1.5 text-xs">
        <span className="text-gray-500">
          <kbd className="font-mono">⌘⏎</kbd> save · <kbd className="font-mono">esc</kbd> cancel
        </span>
        {update.error ? (
          <span className="text-red-600">{update.error.message}</span>
        ) : update.isPending ? (
          <span className="text-gray-400">Saving…</span>
        ) : null}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M2.695 14.762l-1.262 3.155a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.886L17.5 5.501a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8 3a5 5 0 100 10A5 5 0 008 3zM2 8a6 6 0 1112 0A6 6 0 012 8zm6.75-3a.75.75 0 00-1.5 0v3c0 .2.08.39.22.53l2 2a.75.75 0 101.06-1.06L8.75 7.69V5z"
        clipRule="evenodd"
      />
    </svg>
  );
}
