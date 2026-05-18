import { Link } from 'wouter';
import { trpc } from '../trpc';

const SETTING_LABELS: Record<string, string> = {
  'ai.driver': 'AI · Driver',
  'ai.claude.config-dir': 'AI · Claude · Config dir',
  'ai.claude.model': 'AI · Claude · Model',
  'backup.onQuit': 'Backup · On quit',
  'backup.dir': 'Backup · Directory',
};

const SYSTEM_LABELS: Record<string, string> = {
  version: 'Version',
  dataDir: 'Data directory',
  bundled: 'Bundled',
};

export function Debug() {
  const settings = trpc.settings.getAll.useQuery();
  const system = trpc.system.info.useQuery();
  const isLoading = settings.isLoading || system.isLoading;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/settings"
            className="text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            ← Settings
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">Debug</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Live values of stored settings and runtime system info. Read-only.
          </p>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : (
        <>
          <Section title="Settings" subtitle="Stored in the local settings table.">
            <KeyValueTable
              rows={Object.entries(settings.data ?? {}).map(([key, value]) => ({
                key,
                label: SETTING_LABELS[key] ?? key,
                value: String(value),
              }))}
            />
          </Section>

          <Section title="System" subtitle="Process and runtime state.">
            <KeyValueTable
              rows={Object.entries(system.data ?? {}).map(([key, value]) => ({
                key,
                label: SYSTEM_LABELS[key] ?? key,
                value: String(value),
              }))}
            />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

function KeyValueTable({
  rows,
}: {
  rows: ReadonlyArray<{ key: string; label: string; value: string }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm italic text-gray-500 dark:text-gray-400">No values.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.key} className="bg-white dark:bg-gray-900">
              <td className="w-1/3 px-3 py-2 align-top">
                <div className="font-medium text-gray-900 dark:text-gray-100">{r.label}</div>
              </td>
              <td className="px-3 py-2 align-top font-mono text-xs break-all text-gray-700 dark:text-gray-300">
                {r.value === '' ? (
                  <span className="italic text-gray-400 dark:text-gray-600">(empty)</span>
                ) : (
                  r.value
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
