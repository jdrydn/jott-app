import type { TagWithStats } from '@backend/trpc/routers/tags';
import type { TagType } from '@shared/tags';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  forwardRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TagDecorations, type TagResolver } from '../lib/editor/tagDecorations';
import { docToMarkdown } from '../lib/markdown/toMarkdown';
import { trpc } from '../trpc';

export type ComposerHandle = {
  focus: () => void;
};

export const Composer = forwardRef<ComposerHandle>(function Composer(_, ref) {
  const [focused, setFocused] = useState(false);
  const utils = trpc.useUtils();
  const tagsQuery = trpc.tags.list.useQuery();

  const tagsRef = useRef<TagWithStats[]>([]);
  tagsRef.current = tagsQuery.data ?? [];

  const resolveTag: TagResolver = useCallback((type, word) => {
    const key = `${type}:${word.toLowerCase()}`;
    for (const t of tagsRef.current) {
      if (`${t.type as TagType}:${t.name}` === key) {
        return { color: t.color, initials: t.initials, name: t.name };
      }
    }
    return undefined;
  }, []);

  const create = trpc.entries.create.useMutation({
    onSuccess: () => {
      utils.entries.list.invalidate();
      utils.tags.list.invalidate();
    },
  });

  const submitRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: useMemo(
      () => [
        StarterKit.configure({
          heading: false,
          horizontalRule: {},
          codeBlock: {},
          bulletList: {},
          orderedList: {},
          listItem: {},
          blockquote: {},
        }),
        Link.configure({ openOnClick: false, autolink: true }),
        TaskList,
        TaskItem.configure({ nested: false }),
        Placeholder.configure({
          placeholder: 'What just happened? Tag people with @ and topics with #',
        }),
        TagDecorations.configure({ resolveTag }),
      ],
      [resolveTag],
    ),
    editorProps: {
      attributes: {
        class: 'jott-editor px-4 py-3 text-sm text-gray-900',
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    autofocus: 'end',
    immediatelyRender: false,
  });

  const isEmpty = editor?.isEmpty ?? true;
  const canSubmit = !!editor && !isEmpty && !create.isPending;

  const submit = useCallback(() => {
    if (!editor || isEmpty || create.isPending) return;
    const md = docToMarkdown(editor.getJSON() as never).trim();
    if (!md) return;
    create.mutate(
      { body: md },
      {
        onSuccess: () => {
          editor.commands.clearContent(true);
        },
      },
    );
  }, [editor, isEmpty, create]);

  submitRef.current = submit;

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus('end'),
  }));

  // Re-run decorations whenever tag list updates so renames / new tags reflow.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataUpdatedAt is the trigger
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta('jott:tagsRefresh', Date.now()));
  }, [editor, tagsQuery.dataUpdatedAt]);

  function onFormKey(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Escape' && editor) {
      e.preventDefault();
      editor.commands.clearContent(true);
      editor.commands.blur();
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
      onKeyDown={onFormKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <EditorContent editor={editor} />
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
