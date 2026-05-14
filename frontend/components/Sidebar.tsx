import type { TagWithStats } from '@backend/trpc/routers/tags';
import type { ReactNode } from 'react';
import { formatRelative } from '../lib/derive';
import { trpc } from '../trpc';

export function Sidebar({
  activeTagId,
  onSetTagFilter,
  trash,
  onToggleTrash,
}: {
  activeTagId?: string;
  onSetTagFilter?: (tagId: string) => void;
  trash: boolean;
  onToggleTrash: () => void;
}) {
  const list = trpc.tags.list.useQuery();
  const all = list.data ?? [];

  const people = all
    .filter(
      (t): t is TagWithStats & { lastSeen: number } => t.type === 'user' && t.lastSeen != null,
    )
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 8);

  const topics = all
    .filter((t) => t.type === 'topic' && t.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10);

  return (
    <div className="space-y-7">
      <Section title="Recent People" count={people.length}>
        {people.length === 0 ? (
          <Empty>No mentions yet.</Empty>
        ) : (
          <PeopleList people={people} activeId={activeTagId} onSelect={onSetTagFilter} />
        )}
      </Section>
      <Section title="Topics" count={topics.length}>
        {topics.length === 0 ? (
          <Empty>No topics yet.</Empty>
        ) : (
          <TopicList topics={topics} activeId={activeTagId} onSelect={onSetTagFilter} />
        )}
      </Section>
      <Section title="Deleted" count={0}>
        <DeletedRow active={trash} onToggle={onToggleTrash} />
      </Section>
      <TipsBlock />
    </div>
  );
}

function DeletedRow({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const className = `-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded px-2 py-1 text-left ${
    active ? 'bg-slate-100' : 'hover:bg-gray-100'
  }`;
  return (
    <button type="button" onClick={onToggle} className={className}>
      <TrashIcon />
      <span className="flex-1 truncate text-sm text-gray-800">
        {active ? 'Showing trash' : 'Show deleted'}
      </span>
    </button>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 shrink-0 text-gray-500"
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

function PeopleList({
  people,
  activeId,
  onSelect,
}: {
  people: (TagWithStats & { lastSeen: number })[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {people.map((p) => {
        const active = p.id === activeId;
        const className = `-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded px-2 py-1 text-left ${
          active ? 'bg-slate-100' : onSelect ? 'hover:bg-gray-100' : ''
        }`;
        const inner = (
          <>
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold uppercase text-white"
              style={{ backgroundColor: p.color }}
            >
              {p.initials}
            </div>
            <span className="flex-1 truncate text-sm capitalize text-gray-800">{p.name}</span>
            <span className="text-xs text-gray-400">{formatRelative(p.lastSeen)}</span>
          </>
        );
        return (
          <li key={p.id}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(p.id)} className={className}>
                {inner}
              </button>
            ) : (
              <div className={className}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TopicList({
  topics,
  activeId,
  onSelect,
}: {
  topics: TagWithStats[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {topics.map((t) => {
        const active = t.id === activeId;
        const className = `-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded px-2 py-1 text-left ${
          active ? 'bg-slate-100' : onSelect ? 'hover:bg-gray-100' : ''
        }`;
        const inner = (
          <>
            <span className="font-mono" style={{ color: t.color }}>
              #
            </span>
            <span className="flex-1 truncate text-sm text-gray-800">{t.name}</span>
            <span className="text-xs text-gray-400">{t.count}</span>
          </>
        );
        return (
          <li key={t.id}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(t.id)} className={className}>
                {inner}
              </button>
            ) : (
              <div className={className}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
        {count > 0 ? (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            {count}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gray-400">{children}</p>;
}

function TipsBlock() {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tips</h2>
      <ul className="space-y-1.5 text-xs text-gray-600">
        <TipRow keys="⌘K" label="open search" />
        <TipRow keys="N" label="new entry / focus composer" />
        <TipRow keys="⌘⏎" label="save entry" />
      </ul>
      <p className="mt-3 text-xs text-gray-500">
        Type <code className="font-mono text-slate-600">@</code> to mention,{' '}
        <code className="font-mono text-slate-600">#</code> to tag.
      </p>
    </section>
  );
}

function TipRow({ keys, label }: { keys: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <kbd className="inline-block min-w-[1.5rem] rounded border border-gray-200 bg-white px-1.5 py-0.5 text-center font-mono text-[11px] text-gray-600">
        {keys}
      </kbd>
      <span>{label}</span>
    </li>
  );
}
