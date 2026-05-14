import type { EntryWithTags } from '@backend/trpc/routers/entries';
import { type DayGroup, formatTime, groupByDay } from '../lib/format';
import { MarkdownView } from '../lib/markdown/MarkdownView';
import { trpc } from '../trpc';

export function EntryFeed() {
  const list = trpc.entries.list.useQuery();

  if (list.isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (list.error) {
    return <p className="text-sm text-red-500">Error: {list.error.message}</p>;
  }

  const groups = groupByDay(list.data ?? []);

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <DaySection key={group.dateKey} group={group} />
      ))}
    </div>
  );
}

function DaySection({ group }: { group: DayGroup }) {
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
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryRow({ entry }: { entry: EntryWithTags }) {
  return (
    <li className="flex gap-6">
      <span className="mt-0.5 w-12 shrink-0 font-mono text-xs text-gray-400">
        {formatTime(entry.createdAt)}
      </span>
      <div className="flex-1 space-y-2">
        <MarkdownView body={entry.body} links={entry.tags} />
      </div>
    </li>
  );
}
