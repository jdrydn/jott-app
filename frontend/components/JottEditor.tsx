import type { TagWithStats } from '@backend/trpc/routers/tags';
import type { TagType } from '@shared/tags';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { TagDecorations, type TagResolver } from '../lib/editor/tagDecorations';
import { docToMarkdown } from '../lib/markdown/toMarkdown';
import { markdownToDoc } from '../lib/markdown/toProseMirror';
import { trpc } from '../trpc';

export type JottEditorHandle = {
  focus: () => void;
  getMarkdown: () => string;
  isEmpty: () => boolean;
  clear: () => void;
};

export type JottEditorProps = {
  initialBody?: string;
  placeholder?: string;
  autoFocus?: boolean | 'end' | 'start';
  className?: string;
  onSubmit?: (markdown: string) => void;
  onCancel?: () => void;
  onChange?: (markdown: string) => void;
};

const DEFAULT_PLACEHOLDER = 'What just happened? Tag people with @ and topics with #';

export const JottEditor = forwardRef<JottEditorHandle, JottEditorProps>(function JottEditor(
  {
    initialBody = '',
    placeholder = DEFAULT_PLACEHOLDER,
    autoFocus = false,
    className = 'jott-editor px-4 py-3 text-sm text-gray-900',
    onSubmit,
    onCancel,
    onChange,
  },
  ref,
) {
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

  // Stable refs so handler closures don't capture stale callbacks.
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initialContent = useMemo(
    () => (initialBody.length > 0 ? markdownToDoc(initialBody) : undefined),
    [initialBody],
  );

  const editor = useEditor({
    extensions: useMemo(
      () => [
        StarterKit.configure({ heading: false }),
        Link.configure({ openOnClick: false, autolink: true }),
        TaskList,
        TaskItem.configure({ nested: false }),
        Placeholder.configure({ placeholder }),
        TagDecorations.configure({ resolveTag }),
      ],
      [placeholder, resolveTag],
    ),
    content: initialContent,
    editorProps: {
      attributes: { class: className },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          const ed = editor;
          if (!ed || ed.isEmpty) return true;
          onSubmitRef.current?.(docToMarkdown(ed.getJSON() as never).trim());
          return true;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancelRef.current?.();
          return true;
        }
        return false;
      },
    },
    autofocus: autoFocus,
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      onChangeRef.current?.(docToMarkdown(ed.getJSON() as never).trim());
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus('end'),
      getMarkdown: () => (editor ? docToMarkdown(editor.getJSON() as never).trim() : ''),
      isEmpty: () => editor?.isEmpty ?? true,
      clear: () => editor?.commands.clearContent(true),
    }),
    [editor],
  );

  // Refresh chip decorations when the tag list changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataUpdatedAt is the trigger
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta('jott:tagsRefresh', Date.now()));
  }, [editor, tagsQuery.dataUpdatedAt]);

  return <EditorContent editor={editor} />;
});
