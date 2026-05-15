import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { trpc } from '../trpc';
import { JottEditor, type JottEditorHandle } from './JottEditor';

export type ComposerHandle = {
  focus: () => void;
};

export const Composer = forwardRef<ComposerHandle>(function Composer(_, ref) {
  const [focused, setFocused] = useState(false);
  const editorRef = useRef<JottEditorHandle>(null);
  const utils = trpc.useUtils();

  const create = trpc.entries.create.useMutation({
    onSuccess: () => {
      utils.entries.list.invalidate();
      utils.tags.list.invalidate();
      editorRef.current?.clear();
    },
  });

  const submit = useCallback(
    (md: string) => {
      const body = md.trim();
      if (!body || create.isPending) return;
      create.mutate({ body });
    },
    [create],
  );

  const cancel = useCallback(() => {
    editorRef.current?.clear();
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
  }));

  function onFormKey(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <form
      className={`mb-10 overflow-hidden rounded-lg border bg-white transition-colors dark:bg-gray-900 ${
        focused
          ? 'border-slate-400 ring-2 ring-slate-100 dark:border-slate-500 dark:ring-slate-800/60'
          : 'border-gray-200 dark:border-gray-800'
      }`}
      onSubmit={(e) => {
        e.preventDefault();
      }}
      onKeyDown={onFormKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <JottEditor ref={editorRef} autoFocus="end" onSubmit={submit} onCancel={cancel} />
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-950/40">
        <div className="flex items-center gap-1.5">
          <HintChip sigil="@" label="mention" mono />
          <HintChip sigil="#" label="topic" mono />
        </div>
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          {create.error ? (
            <span className="text-red-600 dark:text-red-400">{create.error.message}</span>
          ) : create.isPending ? (
            <span>Saving…</span>
          ) : null}
          <span>
            <kbd className="font-mono">⌘⏎</kbd> save · <kbd className="font-mono">esc</kbd> dismiss
          </span>
        </div>
      </div>
    </form>
  );
});

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
    <span className="inline-flex items-stretch overflow-hidden rounded border border-gray-200 dark:border-gray-700">
      <span
        className={`bg-gray-100 px-1.5 py-0.5 text-gray-700 dark:bg-gray-800 dark:text-gray-200 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {sigil}
      </span>
      <span className="bg-white px-1.5 py-0.5 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
        {label}
      </span>
    </span>
  );
}
