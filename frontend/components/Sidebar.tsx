import type { TagWithStats } from '@backend/trpc/routers/tags';
import type { ReactNode } from 'react';
import { formatRelative } from '../lib/derive';
import { trpc } from '../trpc';

export function Sidebar() {
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
        {people.length === 0 ? <Empty>No mentions yet.</Empty> : <PeopleList people={people} />}
      </Section>
      <Section title="Topics" count={topics.length}>
        {topics.length === 0 ? <Empty>No topics yet.</Empty> : <TopicList topics={topics} />}
      </Section>
      <TipsBlock />
    </div>
  );
}

function PeopleList({ people }: { people: (TagWithStats & { lastSeen: number })[] }) {
  return (
    <ul className="space-y-2.5">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-3">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold uppercase text-white"
            style={{ backgroundColor: p.color }}
          >
            {p.initials}
          </div>
          <span className="flex-1 truncate text-sm capitalize text-gray-800">{p.name}</span>
          <span className="text-xs text-gray-400">{formatRelative(p.lastSeen)}</span>
        </li>
      ))}
    </ul>
  );
}

function TopicList({ topics }: { topics: TagWithStats[] }) {
  return (
    <ul className="space-y-1.5">
      {topics.map((t) => (
        <li key={t.id} className="flex items-center gap-2">
          <span className="font-mono" style={{ color: t.color }}>
            #
          </span>
          <span className="flex-1 truncate text-sm text-gray-800">{t.name}</span>
          <span className="text-xs text-gray-400">{t.count}</span>
        </li>
      ))}
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
