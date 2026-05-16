import { Link } from 'wouter';
import { trpc } from '../trpc';
import type { AiAction } from './AiPanel';
import { DriverIcon } from './DriverIcon';

export function AiBar({ onLaunch }: { onLaunch: (action: AiAction) => void }) {
  const status = trpc.ai.status.useQuery();
  const enabled = status.data?.enabled === true;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-900">
      <span className="flex items-center gap-2 font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <DriverIcon driver={status.data?.driver} />
        AI
      </span>
      {enabled ? (
        <>
          <AiButton onClick={() => onLaunch('summarise')}>Summarise</AiButton>
          <AiButton onClick={() => onLaunch('reflect')}>Reflect</AiButton>
          <AiButton onClick={() => onLaunch('ask')}>Ask</AiButton>
        </>
      ) : (
        <span className="text-gray-500 dark:text-gray-400">
          Disabled — {status.data?.reason ?? 'unavailable'}.{' '}
          <Link
            href="/settings"
            className="font-medium text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
          >
            Open settings
          </Link>
        </span>
      )}
    </div>
  );
}

function AiButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {children}
    </button>
  );
}
