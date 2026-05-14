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
