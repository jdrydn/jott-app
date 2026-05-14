import { trpc } from '../trpc';

export type Filters = {
  tagId?: string;
  from?: number;
  to?: number;
};

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const tagsQuery = trpc.tags.list.useQuery();
  const activeTag =
    filters.tagId != null ? (tagsQuery.data ?? []).find((t) => t.id === filters.tagId) : undefined;

  const hasAnyFilter = activeTag != null || filters.from != null || filters.to != null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
      <span className="font-medium uppercase tracking-wider text-gray-500">Filter</span>

      {activeTag ? (
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
          style={{
            backgroundColor: `color-mix(in srgb, ${activeTag.color} 12%, transparent)`,
            color: activeTag.color,
          }}
        >
          {activeTag.type === 'topic' ? '#' : '@'}
          {activeTag.name}
          <button
            type="button"
            onClick={() => onChange({ ...filters, tagId: undefined })}
            className="ml-0.5 text-current opacity-70 hover:opacity-100"
            aria-label={`Clear ${activeTag.name} filter`}
          >
            ×
          </button>
        </span>
      ) : (
        <span className="text-gray-400">No tag</span>
      )}

      <DateField
        label="From"
        valueMs={filters.from}
        onChange={(ms) => onChange({ ...filters, from: ms })}
      />
      <DateField
        label="To"
        valueMs={filters.to}
        endOfDay
        onChange={(ms) => onChange({ ...filters, to: ms })}
      />

      {hasAnyFilter ? (
        <button
          type="button"
          onClick={() => onChange({})}
          className="ml-auto rounded px-2 py-1 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

function DateField({
  label,
  valueMs,
  endOfDay = false,
  onChange,
}: {
  label: string;
  valueMs?: number;
  endOfDay?: boolean;
  onChange: (ms: number | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-gray-600">
      <span>{label}</span>
      <input
        type="date"
        value={msToInput(valueMs)}
        onChange={(e) => onChange(inputToMs(e.target.value, endOfDay))}
        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
      />
    </label>
  );
}

function msToInput(ms?: number): string {
  if (ms == null) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function inputToMs(value: string, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.getTime();
}
