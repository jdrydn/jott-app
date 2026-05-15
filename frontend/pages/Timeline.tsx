import { useEffect, useRef, useState } from 'react';
import { Composer, type ComposerHandle } from '../components/Composer';
import { EntryFeed } from '../components/EntryFeed';
import { FilterBar, type Filters } from '../components/FilterBar';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { trpc } from '../trpc';

export function Timeline() {
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const [trash, setTrash] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const profile = trpc.profile.get.useQuery();
  const noProfile = profile.isSuccess && profile.data === null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !editable) {
        e.preventDefault();
        composerRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6">
      <Header
        searchRef={searchRef}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        profileName={profile.data?.name ?? null}
      />
      {noProfile ? <NoProfileBanner /> : null}
      <div className="flex gap-12 border-t border-gray-200 py-8 dark:border-gray-800">
        <main className="min-w-0 flex-1">
          {trash || searchQuery ? null : <Composer ref={composerRef} />}
          {trash ? <TrashBanner /> : null}
          {trash || searchQuery ? null : <FilterBar filters={filters} onChange={setFilters} />}
          <EntryFeed
            trash={trash}
            searchQuery={searchQuery}
            filters={trash || searchQuery ? {} : filters}
            onSetTagFilter={(tagId) => setFilters((f) => ({ ...f, tagId }))}
          />
        </main>
        <aside className="w-64 shrink-0">
          <Sidebar
            activeTagId={trash || searchQuery ? undefined : filters.tagId}
            onSetTagFilter={
              trash || searchQuery ? undefined : (tagId) => setFilters((f) => ({ ...f, tagId }))
            }
            trash={trash}
            onToggleTrash={() => setTrash((v) => !v)}
          />
        </aside>
      </div>
    </div>
  );
}

function NoProfileBanner() {
  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200">
      <span>You haven't introduced yourself yet.</span>
      <a
        href="/start"
        className="font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-100"
      >
        Set your name →
      </a>
    </div>
  );
}

function TrashBanner() {
  return (
    <div className="mb-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200">
      Viewing deleted entries. Toggle "Show deleted" off to compose.
    </div>
  );
}
