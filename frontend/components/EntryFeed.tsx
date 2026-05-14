import type { Entry } from '@backend/db/schema';
import { useMemo, useState } from 'react';
import { type DayGroup, formatTime, groupByDay } from '../lib/format';
import { trpc } from '../trpc';
import { BodyText } from './BodyText';

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
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">
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

function EntryRow({ entry }: { entry: Entry }) {
  const [expanded, setExpanded] = useState(false);
  const paragraphs = useMemo(
    () =>
      entry.body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    [entry.body],
  );
  const visible = expanded ? paragraphs : paragraphs.slice(0, 1);
  const hiddenCount = paragraphs.length - 1;

  return (
    <li className="flex gap-6">
      <span className="mt-0.5 w-12 shrink-0 font-mono text-xs text-gray-400">
        {formatTime(entry.createdAt)}
      </span>
      <div className="flex-1 space-y-2 text-sm leading-relaxed text-gray-800">
        {visible.map((para, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are derived from a stable body
          <p key={i} className="whitespace-pre-wrap">
            <BodyText>{para}</BodyText>
          </p>
        ))}
        {!expanded && hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Read full note ( {hiddenCount} more {hiddenCount === 1 ? 'paragraph' : 'paragraphs'} ) →
          </button>
        ) : null}
      </div>
    </li>
  );
}
