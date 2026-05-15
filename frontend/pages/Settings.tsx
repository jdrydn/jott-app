import type { ProfileTheme } from '@backend/db/schema';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useToast } from '../components/Toast';
import { trpc } from '../trpc';

const THEME_OPTIONS: ReadonlyArray<{ value: ProfileTheme; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follow your OS preference' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

export function Settings() {
  const [, setLocation] = useLocation();
  const profile = trpc.profile.get.useQuery();
  const settings = trpc.settings.getAll.useQuery();
  const system = trpc.system.info.useQuery();
  const utils = trpc.useUtils();
  const toast = useToast();

  const upsertProfile = trpc.profile.upsert.useMutation();
  const setSetting = trpc.settings.set.useMutation();

  const [name, setName] = useState('');
  const [theme, setTheme] = useState<ProfileTheme>('system');
  const [claudeBin, setClaudeBin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setTheme(profile.data.theme);
    }
  }, [profile.data]);

  useEffect(() => {
    if (settings.data) {
      setClaudeBin(settings.data['claude.binary'] ?? '');
    }
  }, [settings.data]);

  const isLoading = profile.isLoading || settings.isLoading || system.isLoading;
  const isSaving = upsertProfile.isPending || setSetting.isPending;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    try {
      await upsertProfile.mutateAsync({ name: trimmedName, theme });
      await setSetting.mutateAsync({ key: 'claude.binary', value: claudeBin.trim() });
      await Promise.all([utils.profile.get.invalidate(), utils.settings.getAll.invalidate()]);
      toast.push('Settings saved');
    } catch (err) {
      toast.push((err as Error).message);
    }
  }

  async function copyDbPath() {
    if (!system.data) return;
    try {
      await navigator.clipboard.writeText(system.data.dbPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.push('Could not copy to clipboard');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/timeline"
            className="text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← Timeline
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-10">
          <Section title="Profile" subtitle="How jott greets you.">
            <Field id="name" label="Name" hint="Shown in the header. 1–64 characters.">
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                className={inputClasses}
              />
            </Field>

            <Field id="theme" label="Theme" hint="Light, dark, or follow your system.">
              <fieldset id="theme" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {THEME_OPTIONS.map((opt) => {
                  const active = theme === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm transition ${
                        active
                          ? 'border-slate-500 bg-slate-50 text-slate-900 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-100'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={opt.value}
                        checked={active}
                        onChange={() => setTheme(opt.value)}
                        className="sr-only"
                      />
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{opt.hint}</span>
                    </label>
                  );
                })}
              </fieldset>
            </Field>
          </Section>

          <Section title="System" subtitle="Where things live and how AI talks to your machine.">
            <Field
              id="dbPath"
              label="Database path"
              hint="Set at startup. Use --db or JOTTAPP_DB to change."
            >
              <div className="flex items-center gap-2">
                <input
                  id="dbPath"
                  type="text"
                  readOnly
                  value={system.data?.dbPath ?? ''}
                  className={`${inputClasses} font-mono text-sm text-gray-600 dark:text-gray-400`}
                />
                <button
                  type="button"
                  onClick={copyDbPath}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </Field>

            <Field
              id="claude"
              label="Claude binary"
              hint="Path to the claude CLI. Defaults to 'claude' on PATH. Used by AI features."
            >
              <input
                id="claude"
                type="text"
                value={claudeBin}
                onChange={(e) => setClaudeBin(e.target.value)}
                placeholder="claude"
                className={`${inputClasses} font-mono text-sm`}
              />
            </Field>

            <p className="text-xs text-gray-500 dark:text-gray-500">jott v{system.data?.version}</p>
          </Section>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setLocation('/timeline')}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSaving}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const inputClasses =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-slate-700';

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

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
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{hint}</p> : null}
    </div>
  );
}
