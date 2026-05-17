import type { ProfileTheme } from '@backend/db/schema';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '../components/Toast';
import { useApplyTheme } from '../lib/useTheme';
import { trpc } from '../trpc';

const THEME_OPTIONS: ReadonlyArray<{ value: ProfileTheme; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follow OS' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

const DRIVER_OPTIONS = [{ value: 'claude', label: 'Claude Code' }] as const;

export function Start() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const toast = useToast();

  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<ProfileTheme>('system');
  const [aiDriver, setAiDriver] = useState('');

  useApplyTheme(theme);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const upsertProfile = trpc.profile.upsert.useMutation();
  const setSetting = trpc.settings.set.useMutation();
  const isSaving = upsertProfile.isPending || setSetting.isPending;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSaving) return;
    try {
      await upsertProfile.mutateAsync({ name: trimmed, theme });
      await setSetting.mutateAsync({ key: 'ai.driver', value: aiDriver });
      await Promise.all([
        utils.profile.get.invalidate(),
        utils.settings.getAll.invalidate(),
        utils.ai.status.invalidate(),
      ]);
      setLocation('/timeline');
    } catch (err) {
      toast.push((err as Error).message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-3">
          <img src="/jottapp.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
          <div>
            <h1 className="font-mono text-xl font-bold text-gray-900 dark:text-gray-100">jott</h1>
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              jot it down
            </p>
          </div>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Welcome to jott</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Pick a name, a theme, and (optionally) an AI driver. You can change any of these later in
          Settings.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          <Field id="name" label="Your name">
            <input
              ref={inputRef}
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="James"
              maxLength={64}
              className={inputClasses}
            />
          </Field>

          <Field id="theme" label="Theme">
            <fieldset className="grid grid-cols-3 gap-2" aria-label="Theme">
              {THEME_OPTIONS.map((opt) => {
                const selected = theme === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-sm transition ${
                      selected
                        ? 'border-slate-500 bg-slate-50 dark:border-slate-400 dark:bg-slate-800'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setTheme(opt.value)}
                      className="sr-only"
                    />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{opt.hint}</span>
                  </label>
                );
              })}
            </fieldset>
          </Field>

          <Field
            id="aiDriver"
            label="AI driver"
            hint="Leave as None to disable AI features. You can switch later."
          >
            <select
              id="aiDriver"
              value={aiDriver}
              onChange={(e) => setAiDriver(e.target.value)}
              className={inputClasses}
            >
              <option value="">— None —</option>
              {DRIVER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center justify-end pt-2">
            <button
              type="submit"
              disabled={!name.trim() || isSaving}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
            >
              {isSaving ? 'Saving…' : 'Get started'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClasses =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-slate-700';

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
      >
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}
