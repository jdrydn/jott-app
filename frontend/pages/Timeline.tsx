import { useEffect, useRef, useState } from 'react';
import { AiBar } from '../components/AiBar';
import { type AiAction, AiPanel } from '../components/AiPanel';
import { Composer, type ComposerHandle } from '../components/Composer';
import { EntryFeed } from '../components/EntryFeed';
import { FilterBar, type Filters } from '../components/FilterBar';
import { Header } from '../components/Header';
import { SearchResults } from '../components/SearchResults';
import { Sidebar } from '../components/Sidebar';
import { SidebarDrawer } from '../components/SidebarDrawer';
import { trpc } from '../trpc';

export function Timeline() {
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const [trash, setTrash] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [aiAction, setAiAction] = useState<AiAction | null>(null);
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const profile = trpc.profile.get.useQuery();
  const noProfile = profile.isSuccess && profile.data === null;

  const isSearching = searchQuery.trim().length > 0 && !trash;

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

  const sidebar = (
    <Sidebar
      activeTagId={trash || isSearching ? undefined : filters.tagId}
      onSetTagFilter={
        trash || isSearching
          ? undefined
          : (tagId) => {
              setFilters((f) => ({ ...f, tagId }));
              setDrawerOpen(false);
            }
      }
      trash={trash}
      onToggleTrash={() => {
        setTrash((v) => !v);
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <Header
        searchRef={searchRef}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        profileName={profile.data?.name ?? null}
        onOpenSidebar={() => setDrawerOpen(true)}
      />
      {noProfile ? <NoProfileBanner /> : null}
      <div className="flex gap-8 py-6 md:py-8 lg:gap-12">
        <main className="min-w-0 flex-1">
          {trash || isSearching ? null : <Composer ref={composerRef} />}
          {trash ? <TrashBanner /> : null}
          {trash || isSearching ? null : (
            <>
              <FilterBar filters={filters} onChange={setFilters} />
              <AiBar onLaunch={setAiAction} />
            </>
          )}
          {isSearching ? (
            <SearchResults
              query={searchQuery}
              onPickTag={(tagId) => {
                setFilters((f) => ({ ...f, tagId }));
                setSearchQuery('');
              }}
              onPickEntry={(entryId) => {
                setFocusedEntryId(entryId);
                setSearchQuery('');
              }}
            />
          ) : (
            <EntryFeed
              trash={trash}
              filters={trash ? {} : filters}
              onSetTagFilter={(tagId) => setFilters((f) => ({ ...f, tagId }))}
              focusedEntryId={focusedEntryId}
              onFocusedEntryConsumed={() => setFocusedEntryId(null)}
            />
          )}
        </main>
        <aside className="hidden w-64 shrink-0 md:block">{sidebar}</aside>
      </div>
      <SidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {sidebar}
      </SidebarDrawer>
      {aiAction ? (
        <AiPanel initialAction={aiAction} filters={filters} onClose={() => setAiAction(null)} />
      ) : null}
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
