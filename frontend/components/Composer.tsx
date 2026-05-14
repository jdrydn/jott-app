import type { KeyboardEvent, Ref } from 'react';
import { useState } from 'react';
import { trpc } from '../trpc';

export function Composer({ textareaRef }: { textareaRef?: Ref<HTMLTextAreaElement> }) {
  const [body, setBody] = useState('');
  const [focused, setFocused] = useState(false);
  const utils = trpc.useUtils();
  const create = trpc.entries.create.useMutation({
    onSuccess: () => {
      setBody('');
      utils.entries.list.invalidate();
      utils.tags.list.invalidate();
    },
  });

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !create.isPending;

  function submit() {
    if (canSubmit) create.mutate({ body: trimmed });
  }

  function onTextareaKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setBody('');
      e.currentTarget.blur();
    }
  }

  return (
    <form
      className={`mb-10 overflow-hidden rounded-lg border bg-white transition-colors ${
        focused ? 'border-slate-400 ring-2 ring-slate-100' : 'border-gray-200'
      }`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onTextareaKey}
        placeholder="What just happened? Tag people with @ and topics with #"
        rows={3}
        className="w-full resize-none bg-transparent px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
        // biome-ignore lint/a11y/noAutofocus: composer is the primary input on the page
        autoFocus
      />
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs">
          <HintChip sigil="@" label="mention" mono />
          <HintChip sigil="#" label="topic" mono />
          <HintChip sigil="esc" label="dismiss" />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            canSubmit ? 'bg-slate-500 text-white hover:bg-slate-600' : 'bg-gray-100 text-gray-400'
          }`}
        >
          {create.isPending ? 'Saving…' : 'Save entry'}
          <kbd className="font-mono text-[11px] opacity-70">⌘⏎</kbd>
        </button>
      </div>
      {create.error ? (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
          {create.error.message}
        </p>
      ) : null}
    </form>
  );
}

function HintChip({
  sigil,
  label,
  mono = false,
}: {
  sigil: string;
  label: string;
  mono?: boolean;
}) {
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded border border-gray-200">
      <span className={`bg-gray-100 px-1.5 py-0.5 text-gray-700 ${mono ? 'font-mono' : ''}`}>
        {sigil}
      </span>
      <span className="bg-white px-1.5 py-0.5 text-gray-500">{label}</span>
    </span>
  );
}
