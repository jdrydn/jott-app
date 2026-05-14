import type { Ref } from 'react';
import { formatHeaderDate } from '../lib/format';

export function Header({ searchRef }: { searchRef?: Ref<HTMLInputElement> }) {
  const today = formatHeaderDate(new Date());
  return (
    <header className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500 font-bold text-white">
          🗒️
        </div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold font-mono text-gray-900">jott</h1>
          <span className="text-gray-300">·</span>
          <span className="text-sm text-gray-500">{today}</span>
        </div>
      </div>
      <div className="flex w-80 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <SearchIcon />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search entries, people, topics…"
          className="flex-1 bg-transparent text-sm placeholder-gray-400 focus:outline-none"
        />
        <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-xs text-gray-500">
          ⌘K
        </kbd>
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
      className="h-4 w-4 shrink-0 text-gray-400"
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
