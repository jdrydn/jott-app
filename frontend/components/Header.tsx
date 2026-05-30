import { type Ref, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { formatHeaderDate } from '../lib/format';
import { isTauri } from '../lib/isTauri';

export function Header({
  searchRef,
  searchQuery,
  onSearchQueryChange,
  profileName,
  onOpenSidebar,
}: {
  searchRef?: Ref<HTMLInputElement>;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  profileName?: string | null;
  onOpenSidebar: () => void;
}) {
  const today = formatHeaderDate(new Date());
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mobileSearchOpen) mobileSearchRef.current?.focus();
  }, [mobileSearchOpen]);

  function closeMobileSearch() {
    setMobileSearchOpen(false);
    onSearchQueryChange('');
  }

  return (
    <header
      className={`sticky top-0 z-30 border-b border-gray-200 bg-white pb-4 dark:border-gray-800 dark:bg-gray-950 ${
        isTauri ? 'pt-10' : 'pt-4'
      }`}
    >
      {mobileSearchOpen ? (
        <div className="flex items-center gap-2 md:hidden">
          <SearchBox
            inputRef={mobileSearchRef}
            value={searchQuery}
            onChange={onSearchQueryChange}
            onClear={() => onSearchQueryChange('')}
            showKbd={false}
            className="flex flex-1"
          />
          <button
            type="button"
            onClick={closeMobileSearch}
            className="rounded-lg px-2 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
              <img
                src="/jottapp.png"
                alt="Jott-App Logo"
                aria-hidden="true"
                className="h-7 w-7"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="flex min-w-0 items-baseline gap-3">
              <h1 className="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">jott</h1>
              <span className="hidden text-gray-300 sm:inline dark:text-gray-700">·</span>
              <span className="hidden truncate text-sm text-gray-500 sm:inline dark:text-gray-400">
                {today}
              </span>
              {profileName ? (
                <>
                  <span className="hidden text-gray-300 lg:inline dark:text-gray-700">·</span>
                  <span className="hidden truncate text-sm text-gray-700 lg:inline dark:text-gray-300">
                    Hello, <span className="font-medium">{profileName}</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SearchBox
              inputRef={searchRef}
              value={searchQuery}
              onChange={onSearchQueryChange}
              onClear={() => onSearchQueryChange('')}
              showKbd
              className="hidden w-80 md:flex"
            />
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
              title="Search"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 md:hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <SearchIcon />
            </button>
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 md:flex dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <GearIcon />
            </Link>
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open menu"
              title="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 md:hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function SearchBox({
  inputRef,
  value,
  onChange,
  onClear,
  showKbd,
  className = '',
}: {
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  onChange: (q: string) => void;
  onClear: () => void;
  showKbd: boolean;
  className?: string;
}) {
  return (
    <div
      className={`items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 ${className}`}
    >
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search entries, people, topics…"
        className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder-gray-500"
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Clear search"
          title="Clear search"
        >
          ×
        </button>
      ) : showKbd ? (
        <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          ⌘K
        </kbd>
      ) : null}
    </div>
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

function MenuIcon() {
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
        d="M3 5.75A.75.75 0 0 1 3.75 5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.75ZM3 10a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm.75 3.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H3.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
