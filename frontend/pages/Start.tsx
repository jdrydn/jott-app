import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '../components/Toast';
import { trpc } from '../trpc';

export function Start() {
  const [, setLocation] = useLocation();
  const profile = trpc.profile.get.useQuery();
  const utils = trpc.useUtils();
  const toast = useToast();

  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const upsert = trpc.profile.upsert.useMutation({
    onSuccess: async () => {
      await utils.profile.get.invalidate();
      setLocation('/timeline');
    },
    onError: (err) => {
      toast.push(err.message);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || upsert.isPending) return;
    upsert.mutate({ name: trimmed });
  }

  const existingName = profile.data?.name ?? '';
  const heading = existingName ? `Hi again, ${existingName}` : 'Welcome to jott';
  const subhead = existingName
    ? 'Update the name we greet you with.'
    : 'Tell jott what to call you. You can change this any time in settings.';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-500 text-lg font-bold text-white">
            🗒️
          </div>
          <div>
            <h1 className="font-mono text-xl font-bold text-gray-900 dark:text-gray-100">jott</h1>
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              jot it down
            </p>
          </div>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{heading}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subhead}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              Your name
            </label>
            <input
              ref={inputRef}
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={existingName || 'James'}
              maxLength={64}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:ring-slate-700"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            {existingName ? (
              <button
                type="button"
                onClick={() => setLocation('/timeline')}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!name.trim() || upsert.isPending}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-600 dark:hover:bg-slate-500"
            >
              {upsert.isPending ? 'Saving…' : existingName ? 'Save' : 'Get started'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
