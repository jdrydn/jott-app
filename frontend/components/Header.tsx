import type { Ref } from 'react';
import { Link } from 'wouter';
import { formatHeaderDate } from '../lib/format';

export function Header({
  searchRef,
  searchQuery,
  onSearchQueryChange,
  profileName,
}: {
  searchRef?: Ref<HTMLInputElement>;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  profileName?: string | null;
}) {
  const today = formatHeaderDate(new Date());
  return (
    <header className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center">
          <img
            src="/jottapp.png"
            alt="Jott-App Logo"
            aria-hidden="true"
            className="h-7 w-7"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">jott</h1>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{today}</span>
          {profileName ? (
            <>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Hello, <span className="font-medium">{profileName}</span>
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex w-80 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search entries, people, topics…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder-gray-500"
          />
          {searchQuery.length > 0 ? (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Clear search"
              title="Clear search"
            >
              ×
            </button>
          ) : (
            <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              ⌘K
            </kbd>
          )}
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <GearIcon />
        </Link>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 3.61 9.65l3.62 3.62a.75.75 0 1 0 1.06-1.06l-3.62-3.62A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M11.49 3.17a.75.75 0 0 0-1.48 0l-.18 1.08a6 6 0 0 0-1.65.68l-.84-.7a.75.75 0 0 0-1.04 1.04l.7.84a6 6 0 0 0-.68 1.65l-1.08.18a.75.75 0 0 0 0 1.48l1.08.18c.13.59.36 1.14.68 1.65l-.7.84a.75.75 0 0 0 1.04 1.04l.84-.7c.51.32 1.06.55 1.65.68l.18 1.08a.75.75 0 0 0 1.48 0l.18-1.08a6 6 0 0 0 1.65-.68l.84.7a.75.75 0 0 0 1.04-1.04l-.7-.84a6 6 0 0 0 .68-1.65l1.08-.18a.75.75 0 0 0 0-1.48l-1.08-.18a6 6 0 0 0-.68-1.65l.7-.84a.75.75 0 0 0-1.04-1.04l-.84.7a6 6 0 0 0-1.65-.68l-.18-1.08ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
