import type { TagWithStats } from '@backend/trpc/routers/tags';
import type { TagType } from '@shared/tags';
import type { Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { uploadImage } from '../lib/editor/imageUpload';
import { ImageUploadNode } from '../lib/editor/imageUploadNode';
import { SlashMenu } from '../lib/editor/slashMenu';
import { TagAutocomplete, type TagSuggestion } from '../lib/editor/tagAutocomplete';
import type { ResolvedTag, TagLookup } from '../lib/editor/tagChipView';
import { TagNode } from '../lib/editor/tagNode';
import { docToMarkdown } from '../lib/markdown/toMarkdown';
import { markdownToDoc } from '../lib/markdown/toProseMirror';
import { trpc } from '../trpc';

function insertImageAt(editor: Editor, pos: number, src: string, alt: string): void {
  editor.chain().focus().insertContentAt(pos, { type: 'image', attrs: { src, alt } }).run();
}

async function uploadAndInsert(editor: Editor, file: File, pos: number): Promise<void> {
  try {
    const result = await uploadImage(file);
    insertImageAt(editor, pos, result.url, file.name);
  } catch (err) {
    console.error('image upload failed', err);
  }
}

export type JottEditorHandle = {
  focus: () => void;
  getMarkdown: () => string;
  isEmpty: () => boolean;
  clear: () => void;
  flush: () => void;
};

export type JottEditorProps = {
  initialBody?: string;
  placeholder?: string;
  autoFocus?: boolean | 'end' | 'start';
  className?: string;
  onSubmit?: (markdown: string) => void;
  onCancel?: () => void;
  onChange?: (markdown: string) => void;
  onAutoSave?: (markdown: string) => void;
  autoSaveDebounceMs?: number;
};

const DEFAULT_PLACEHOLDER = 'What just happened? Tag people with @ and topics with #';

export const JottEditor = forwardRef<JottEditorHandle, JottEditorProps>(function JottEditor(
  {
    initialBody = '',
    placeholder = DEFAULT_PLACEHOLDER,
    autoFocus = false,
    className = 'jott-editor px-4 py-3 text-sm text-gray-900 dark:text-gray-100',
    onSubmit,
    onCancel,
    onChange,
    onAutoSave,
    autoSaveDebounceMs = 800,
  },
  ref,
) {
  const tagsQuery = trpc.tags.list.useQuery();
  const tagsRef = useRef<TagWithStats[]>([]);
  tagsRef.current = tagsQuery.data ?? [];

  const utils = trpc.useUtils();
  const createTagMutation = trpc.tags.create.useMutation();

  const resolveTag: TagLookup = useCallback((id) => {
    for (const t of tagsRef.current) {
      if (t.id === id) {
        return {
          id: t.id,
          type: t.type as TagType,
          name: t.name,
          initials: t.initials,
          color: t.color,
        } satisfies ResolvedTag;
      }
    }
    return undefined;
  }, []);

  const suggest = useCallback((type: TagType, query: string): TagSuggestion[] => {
    const q = query.trim().toLowerCase();
    const matching = tagsRef.current
      .filter((t) => (t.type as TagType) === type)
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true));
    matching.sort((a, b) => {
      // Prefer prefix matches, then by count desc, then alphabetical.
      const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (a.count !== b.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
    return matching.map((t) => ({
      id: t.id,
      type: t.type as TagType,
      name: t.name,
      initials: t.initials,
      color: t.color,
    }));
  }, []);

  const createTag = useCallback(
    async (type: TagType, name: string): Promise<{ id: string }> => {
      const tag = await createTagMutation.mutateAsync({ type, name });
      // Patch the local ref synchronously so the NodeView that's about to mount
      // (inside the same microtask) can resolve the chip on first render —
      // otherwise it falls through to the "broken" branch and renders the raw
      // marker until the next PM transaction triggers a NodeView update.
      const now = Date.now();
      tagsRef.current = [
        ...tagsRef.current,
        {
          id: tag.id,
          type: tag.type,
          name: tag.name,
          initials: tag.initials,
          color: tag.color,
          createdAt: now,
          updatedAt: now,
          count: 0,
          lastSeen: null,
        },
      ];
      // Re-fetch in the background so the sidebar + other consumers catch up.
      void utils.tags.list.invalidate();
      return { id: tag.id };
    },
    [createTagMutation, utils.tags.list],
  );

  // Stable refs so handler closures don't capture stale callbacks.
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAutoSaveRef = useRef(onAutoSave);
  onAutoSaveRef.current = onAutoSave;

  // Debounced autosave bookkeeping.
  const lastSavedRef = useRef<string>(initialBody.trim());
  const pendingMdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current != null) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const md = pendingMdRef.current;
    pendingMdRef.current = null;
    if (md == null || md === lastSavedRef.current || md.length === 0) return;
    lastSavedRef.current = md;
    onAutoSaveRef.current?.(md);
  }, []);

  const scheduleAutoSave = useCallback(
    (md: string) => {
      if (!onAutoSaveRef.current) return;
      if (md === lastSavedRef.current || md.length === 0) {
        if (autoSaveTimerRef.current != null) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        pendingMdRef.current = null;
        return;
      }
      pendingMdRef.current = md;
      if (autoSaveTimerRef.current != null) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(flushAutoSave, autoSaveDebounceMs);
    },
    [autoSaveDebounceMs, flushAutoSave],
  );

  // Flush any pending autosave on unmount so transient edits don't get lost.
  useEffect(() => () => flushAutoSave(), [flushAutoSave]);

  const initialContent = useMemo(
    () => (initialBody.length > 0 ? markdownToDoc(initialBody) : undefined),
    [initialBody],
  );

  const editor = useEditor({
    extensions: useMemo(
      () => [
        StarterKit.configure({
          heading: false,
          link: { openOnClick: false, autolink: true },
        }),
        TaskList,
        TaskItem.configure({ nested: false }),
        Image.configure({ inline: false, allowBase64: false }),
        ImageUploadNode,
        Placeholder.configure({ placeholder }),
        TagNode.configure({ resolveTag }),
        TagAutocomplete.configure({ suggest, createTag }),
        SlashMenu.configure({
          commands: [
            {
              id: 'image',
              label: 'Image',
              hint: 'Drop or pick a file',
              run: (ed, range) => {
                ed.chain().focus().insertContentAt(range, { type: 'imageUpload' }).run();
              },
            },
          ],
        }),
      ],
      [placeholder, resolveTag, suggest, createTag],
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
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const ed = editor;
        if (!ed) return true;
        const pos = view.state.selection.from;
        for (const file of files) void uploadAndInsert(ed, file, pos);
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const ed = editor;
        if (!ed) return true;
        const coords = { left: event.clientX, top: event.clientY };
        const dropPos = view.posAtCoords(coords)?.pos ?? view.state.selection.from;
        for (const file of files) void uploadAndInsert(ed, file, dropPos);
        return true;
      },
    },
    autofocus: autoFocus,
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      const md = docToMarkdown(ed.getJSON() as never).trim();
      onChangeRef.current?.(md);
      scheduleAutoSave(md);
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus('end'),
      getMarkdown: () => (editor ? docToMarkdown(editor.getJSON() as never).trim() : ''),
      isEmpty: () => editor?.isEmpty ?? true,
      clear: () => {
        editor?.commands.clearContent(true);
        lastSavedRef.current = '';
        pendingMdRef.current = null;
        if (autoSaveTimerRef.current != null) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
      },
      flush: flushAutoSave,
    }),
    [editor, flushAutoSave],
  );

  // Force a re-render of chip NodeViews when the tag list updates (rename,
  // color change, etc.) so live data flows through `resolveTag`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataUpdatedAt is the trigger
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta('jott:tagsRefresh', Date.now()));
  }, [editor, tagsQuery.dataUpdatedAt]);

  return <EditorContent editor={editor} />;
});
