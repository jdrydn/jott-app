import { useEffect, useRef, useState } from 'react';
import { Composer, type ComposerHandle } from './components/Composer';
import { EntryFeed } from './components/EntryFeed';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';

export function App() {
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const [trash, setTrash] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl px-6">
        <Header
          searchRef={searchRef}
          trash={trash}
          onToggleTrash={() => setTrash((v) => !v)}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />
        <div className="flex gap-12 border-t border-gray-200 py-8">
          <main className="min-w-0 flex-1">
            {trash || searchQuery ? null : <Composer ref={composerRef} />}
            {trash ? <TrashBanner /> : null}
            <EntryFeed trash={trash} searchQuery={searchQuery} />
          </main>
          <aside className="w-64 shrink-0">
            <Sidebar />
          </aside>
        </div>
      </div>
    </div>
  );
}

function TrashBanner() {
  return (
    <div className="mb-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Viewing deleted entries. Toggle "Show deleted" off to compose.
    </div>
  );
}
