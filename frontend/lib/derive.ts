import type { Entry } from '@backend/db/schema';

const TOKEN_RE = /([#@])(\w+)/g;

export type Mention = {
  name: string;
  initials: string;
  lastSeen: number;
};

export type Topic = {
  name: string;
  count: number;
};

export function derivePeople(entries: Entry[], limit = 8): Mention[] {
  const byName = new Map<string, Mention>();
  for (const e of entries) {
    for (const m of e.body.matchAll(TOKEN_RE)) {
      if (m[1] !== '@') continue;
      const name = m[2];
      if (!name) continue;
      const existing = byName.get(name);
      if (existing) {
        if (e.createdAt > existing.lastSeen) existing.lastSeen = e.createdAt;
      } else {
        byName.set(name, { name, initials: initialsOf(name), lastSeen: e.createdAt });
      }
    }
  }
  return [...byName.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, limit);
}

export function deriveTopics(entries: Entry[], limit = 10): Topic[] {
  const byName = new Map<string, Topic>();
  for (const e of entries) {
    for (const m of e.body.matchAll(TOKEN_RE)) {
      if (m[1] !== '#') continue;
      const name = m[2];
      if (!name) continue;
      const existing = byName.get(name);
      if (existing) existing.count++;
      else byName.set(name, { name, count: 1 });
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function initialsOf(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const startOfDay = (t: number): number => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const daysAgo = Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000);
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo > 0 && daysAgo < 7) return `${daysAgo} days ago`;
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
