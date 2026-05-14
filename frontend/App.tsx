import { useEffect, useRef } from 'react';
import { Composer } from './components/Composer';
import { EntryFeed } from './components/EntryFeed';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';

export function App() {
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

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
        <Header searchRef={searchRef} />
        <div className="flex gap-12 border-t border-gray-200 py-8">
          <main className="min-w-0 flex-1">
            <Composer textareaRef={composerRef} />
            <EntryFeed />
          </main>
          <aside className="w-64 shrink-0">
            <Sidebar />
          </aside>
        </div>
      </div>
    </div>
  );
}
