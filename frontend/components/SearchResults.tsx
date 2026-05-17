import type { EntryHit, PersonHit, SearchResult, TopicHit } from '@backend/trpc/routers/search';
import { useEffect, useState } from 'react';
import { formatTime } from '../lib/format';
import { trpc } from '../trpc';

export function SearchResults({
  query,
  onPickTag,
  onPickEntry,
}: {
  query: string;
  onPickTag: (tagId: string) => void;
  onPickEntry: (entryId: string) => void;
}) {
  const debounced = useDebouncedValue(query.trim(), 150);
  const enabled = debounced.length > 0;
  const result = trpc.search.query.useQuery({ q: debounced }, { enabled });

  if (!enabled) return null;
  if (result.isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Searching…</p>;
  }
  if (result.error) {
    return <p className="text-sm text-red-500 dark:text-red-400">Error: {result.error.message}</p>;
  }
  const data: SearchResult = result.data ?? { people: [], topics: [], entries: [] };
  const empty = data.people.length === 0 && data.topics.length === 0 && data.entries.length === 0;

  if (empty) {
    return (
      <p className="text-sm italic text-gray-400 dark:text-gray-500">
        No matches for "{debounced}".
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {data.people.length > 0 ? (
        <Section title="People" count={data.people.length}>
          <ul className="space-y-1">
            {data.people.map((p) => (
              <li key={p.tagId}>
                <PersonRow person={p} onClick={() => onPickTag(p.tagId)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {data.topics.length > 0 ? (
        <Section title="Topics" count={data.topics.length}>
          <ul className="space-y-1">
            {data.topics.map((t) => (
              <li key={t.tagId}>
                <TopicRow topic={t} onClick={() => onPickTag(t.tagId)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {data.entries.length > 0 ? (
        <Section title="Entries" count={data.entries.length}>
          <ul className="space-y-2">
            {data.entries.map((e) => (
              <li key={e.entryId}>
                <EntryHitRow entry={e} onClick={() => onPickEntry(e.entryId)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between border-b border-gray-200 pb-1.5 dark:border-gray-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">{count}</span>
      </header>
      {children}
    </section>
  );
}

function PersonRow({ person, onClick }: { person: PersonHit; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <span className="font-bold" style={{ color: person.color }}>
        @
      </span>
      <span className="flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
        {person.name}
      </span>
      <CountBadge count={person.entryCount} label="entries" />
    </button>
  );
}

function TopicRow({ topic, onClick }: { topic: TopicHit; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <span className="font-bold" style={{ color: topic.color }}>
        #
      </span>
      <span className="flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{topic.name}</span>
      <CountBadge count={topic.entryCount} label="entries" />
    </button>
  );
}

function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <span className="text-xs text-gray-400 dark:text-gray-500">
      {count} {count === 1 ? label.replace(/s$/, '') : label}
    </span>
  );
}

function EntryHitRow({ entry, onClick }: { entry: EntryHit; onClick: () => void }) {
  const date = new Date(entry.createdAt);
  const dateLabel = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
          {formatTime(entry.createdAt)}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{dateLabel}</span>
      </div>
      <SnippetView snippet={entry.snippet} />
    </button>
  );
}

// FTS5's snippet() wraps matches in our chosen markers (`[` … `]`). Split on
// them so we can <mark> the highlights without doing dangerous innerHTML.
function SnippetView({ snippet }: { snippet: string }) {
  const parts = snippet.split(/\[([^\]]*)\]/);
  return (
    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            // biome-ignore lint/suspicious/noArrayIndexKey: snippet is stable per render
            key={i}
            className="rounded bg-amber-100 px-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
          >
            {part}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: snippet is stable per render
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
