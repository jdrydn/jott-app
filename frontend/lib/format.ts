import type { Entry } from '@backend/db/schema';

export type DayGroup = {
  dateKey: string;
  label: string;
  dateFormatted: string;
  entries: Entry[];
};

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function groupByDay(entries: Entry[], now: Date = new Date()): DayGroup[] {
  const today = startOfDay(now);
  const yesterday = startOfDay(new Date(today.getTime() - 86_400_000));
  const todayKey = dateKey(today);
  const yesterdayKey = dateKey(yesterday);

  const byDate = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = dateKey(startOfDay(new Date(e.createdAt)));
    const arr = byDate.get(key) ?? [];
    arr.push(e);
    byDate.set(key, arr);
  }

  if (!byDate.has(todayKey)) byDate.set(todayKey, []);

  const keys = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  return keys.map((key) => {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
    const label =
      key === todayKey
        ? 'TODAY'
        : key === yesterdayKey
          ? 'YESTERDAY'
          : date.toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
    const dateFormatted = date.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return { dateKey: key, label, dateFormatted, entries: byDate.get(key) ?? [] };
  });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatHeaderDate(d: Date): string {
  return d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
