import { useState } from 'react';
import { trpc } from './trpc';

export function App() {
  const [body, setBody] = useState('');
  const utils = trpc.useUtils();
  const list = trpc.entries.list.useQuery();
  const create = trpc.entries.create.useMutation({
    onSuccess: () => {
      setBody('');
      utils.entries.list.invalidate();
    },
  });

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !create.isPending;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">jottapp</h1>

      <form
        className="mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate({ body: trimmed });
        }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Jot something down…"
          rows={4}
          disabled={create.isPending}
          className="w-full rounded border border-gray-300 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {create.error ? `Error: ${create.error.message}` : `${trimmed.length} characters`}
          </span>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {create.isPending ? 'Saving…' : 'Jot it down'}
          </button>
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">Entries</h2>
        {list.isLoading && <p className="text-gray-500">Loading…</p>}
        {list.error && <p className="text-red-500">Error: {list.error.message}</p>}
        {list.data?.length === 0 && <p className="text-gray-500">No entries yet.</p>}
        <ul className="space-y-3">
          {list.data?.map((entry) => (
            <li key={entry.id} className="rounded border border-gray-200 bg-white p-4">
              <time className="text-xs text-gray-500">
                {new Date(entry.createdAt).toLocaleString()}
              </time>
              <p className="mt-1 whitespace-pre-wrap">{entry.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
