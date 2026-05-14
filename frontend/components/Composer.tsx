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
  const [isEmpty, setIsEmpty] = useState(true);
  const editorRef = useRef<JottEditorHandle>(null);
  const utils = trpc.useUtils();

  const create = trpc.entries.create.useMutation({
    onSuccess: () => {
      utils.entries.list.invalidate();
      utils.tags.list.invalidate();
      editorRef.current?.clear();
      setIsEmpty(true);
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
    setIsEmpty(true);
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
  }));

  const canSubmit = !isEmpty && !create.isPending;

  function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (editorRef.current) submit(editorRef.current.getMarkdown());
  }

  function onFormKey(e: KeyboardEvent<HTMLFormElement>) {
    // Editor handles Esc itself; this is a fallback for clicks within the form chrome.
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <form
      className={`mb-10 overflow-hidden rounded-lg border bg-white transition-colors ${
        focused ? 'border-slate-400 ring-2 ring-slate-100' : 'border-gray-200'
      }`}
      onSubmit={onFormSubmit}
      onKeyDown={onFormKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <JottEditor
        ref={editorRef}
        autoFocus="end"
        onSubmit={submit}
        onCancel={cancel}
        onChange={(md) => setIsEmpty(md.length === 0)}
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
    <span className="inline-flex items-stretch overflow-hidden rounded border border-gray-200">
      <span className={`bg-gray-100 px-1.5 py-0.5 text-gray-700 ${mono ? 'font-mono' : ''}`}>
        {sigil}
      </span>
      <span className="bg-white px-1.5 py-0.5 text-gray-500">{label}</span>
    </span>
  );
}
