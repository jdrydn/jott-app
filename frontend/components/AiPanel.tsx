import { type FormEvent, useEffect, useRef, useState } from 'react';
import { trpc } from '../trpc';
import { DriverIcon } from './DriverIcon';
import type { Filters } from './FilterBar';
import { useToast } from './Toast';

export type AiAction = 'summarise' | 'reflect' | 'ask';

const ACTION_LABELS: Record<AiAction, { title: string; verb: string; hint: string }> = {
  summarise: {
    title: 'Summarise',
    verb: 'Summarise',
    hint: 'A short TL;DR of what mattered in the selected window.',
  },
  reflect: {
    title: 'Reflect',
    verb: 'Reflect',
    hint: 'Themes, patterns, or shifts in mood/focus across the selected window.',
  },
  ask: {
    title: 'Ask',
    verb: 'Ask Claude',
    hint: 'Ask a question about your entries — answers come from the selected window only.',
  },
};

export function AiPanel({
  initialAction,
  filters,
  onClose,
}: {
  initialAction: AiAction;
  filters: Filters;
  onClose: () => void;
}) {
  const [action, setAction] = useState<AiAction>(initialAction);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<{ text: string; entryCount: number; model: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const status = trpc.ai.status.useQuery();
  const tags = trpc.tags.list.useQuery();
  const preview = trpc.ai.slicePreview.useQuery(filters);
  const summarise = trpc.ai.summarise.useMutation();
  const reflect = trpc.ai.reflect.useMutation();
  const ask = trpc.ai.ask.useMutation();

  const isPending = summarise.isPending || reflect.isPending || ask.isPending;
  const activeTag =
    filters.tagId != null ? (tags.data ?? []).find((t) => t.id === filters.tagId) : undefined;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isPending]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      let res: { text: string; entryCount: number; model: string };
      if (action === 'ask') {
        const q = question.trim();
        if (!q) return;
        res = await ask.mutateAsync({ q, ...filters });
      } else if (action === 'reflect') {
        res = await reflect.mutateAsync(filters);
      } else {
        res = await summarise.mutateAsync(filters);
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      toast.push('Copied to clipboard');
    } catch {
      toast.push('Could not copy');
    }
  }

  const labels = ACTION_LABELS[action];
  const enabled = status.data?.enabled === true;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/40 px-4 py-8 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-label="AI panel"
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl outline-none dark:border-gray-800 dark:bg-gray-900"
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <DriverIcon driver={status.data?.driver} />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex shrink-0 gap-1 border-b border-gray-100 px-5 py-2 dark:border-gray-800">
          {(['summarise', 'reflect', 'ask'] as AiAction[]).map((a) => {
            const active = a === action;
            return (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAction(a);
                  setResult(null);
                  setError(null);
                }}
                className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                  active
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                }`}
              >
                {ACTION_LABELS[a].title}
              </button>
            );
          })}
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">{labels.hint}</p>
            <WindowSummary
              filters={filters}
              activeTagName={activeTag?.name ?? null}
              preview={preview.data}
            />
            {action === 'ask' ? (
              <div>
                <label
                  htmlFor="ai-question"
                  className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  Question
                </label>
                <textarea
                  id="ai-question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={askPlaceholder(activeTag)}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-slate-700"
                />
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {!enabled ? (
              <DisabledNote reason={status.data?.reason} />
            ) : error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : isPending ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Thinking…</p>
            ) : result ? (
              <div className="space-y-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900 dark:text-gray-100">
                  {result.text}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Based on {result.entryCount} {result.entryCount === 1 ? 'entry' : 'entries'}.
                </p>
              </div>
            ) : (
              <p className="text-sm italic text-gray-400 dark:text-gray-500">
                Run to see the response here.
              </p>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-5 py-3 text-xs dark:border-gray-800 dark:bg-gray-950/40">
            <span className="text-gray-400 dark:text-gray-500">
              <kbd className="font-mono">esc</kbd> close
            </span>
            <div className="flex items-center gap-2">
              {result ? (
                <button
                  type="button"
                  onClick={copyResult}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Copy
                </button>
              ) : null}
              <button
                type="submit"
                disabled={!enabled || isPending || (action === 'ask' && !question.trim())}
                className="rounded-lg bg-slate-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
              >
                {isPending ? 'Running…' : labels.verb}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function askPlaceholder(
  activeTag: { type: 'topic' | 'user'; name: string } | undefined,
): string {
  if (!activeTag) return 'What was my last week like';
  if (activeTag.type === 'user') return `When did I speak to @${activeTag.name}`;
  return `When did I last speak about #${activeTag.name}`;
}

type SlicePreview = {
  count: number;
  oldest: number | null;
  newest: number | null;
  cap: number;
};

function WindowSummary({
  filters,
  activeTagName,
  preview,
}: {
  filters: Filters;
  activeTagName: string | null;
  preview: SlicePreview | undefined;
}) {
  const summary = formatWindowSummary({ filters, activeTagName, preview });
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400">
      Window: <span className="font-medium text-gray-700 dark:text-gray-300">{summary}</span>
      <span className="ml-1 text-gray-400 dark:text-gray-500">
        (change in the timeline filter to adjust)
      </span>
    </div>
  );
}

export function formatWindowSummary({
  filters,
  activeTagName,
  preview,
}: {
  filters: { from?: number; to?: number };
  activeTagName: string | null;
  preview: SlicePreview | undefined;
}): string {
  const range =
    filters.from != null && filters.to != null
      ? `${formatDate(filters.from)} → ${formatDate(filters.to)}`
      : filters.from != null
        ? `from ${formatDate(filters.from)}`
        : filters.to != null
          ? `up to ${formatDate(filters.to)}`
          : 'all time';

  let scope: string;
  if (!preview) {
    scope = '(loading…)';
  } else if (preview.count === 0) {
    scope = '(no entries)';
  } else if (preview.count >= preview.cap) {
    scope = preview.oldest
      ? `(most recent ${preview.cap}, back to ${formatDate(preview.oldest)})`
      : `(most recent ${preview.cap})`;
  } else {
    const noun = preview.count === 1 ? 'entry' : 'entries';
    scope = `(${preview.count} ${noun})`;
  }

  const tagSuffix = activeTagName ? ` · #${activeTagName}` : '';
  return `${range} ${scope}${tagSuffix}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function DisabledNote({ reason }: { reason?: string }) {
  return (
    <p className="text-sm text-amber-700 dark:text-amber-300">
      AI is disabled — {reason ?? 'driver unavailable'}. Open settings to configure.
    </p>
  );
}
