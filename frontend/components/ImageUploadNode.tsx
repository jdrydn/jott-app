import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
import { uploadImage } from '../lib/editor/imageUpload';

export function ImageUploadView({ editor, getPos, deleteNode }: NodeViewProps) {
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File): Promise<void> {
    setState('uploading');
    setError(null);
    try {
      const result = await uploadImage(file);
      const pos = typeof getPos === 'function' ? getPos() : null;
      if (pos != null) {
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: pos, to: pos + 1 },
            { type: 'image', attrs: { src: result.url, alt: file.name } },
          )
          .run();
      } else {
        deleteNode();
      }
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handle(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handle(file);
  }

  const base = 'jott-upload';
  const stateClass =
    state === 'uploading'
      ? `${base} ${base}--uploading`
      : dragOver
        ? `${base} ${base}--dragover`
        : base;

  return (
    <NodeViewWrapper
      className={stateClass}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      contentEditable={false}
    >
      <button
        type="button"
        className="jott-upload__inner"
        onClick={() => inputRef.current?.click()}
        disabled={state === 'uploading'}
      >
        {state === 'uploading' ? (
          <span>Uploading…</span>
        ) : state === 'error' ? (
          <>
            <span className="jott-upload__title">Upload failed</span>
            <span className="jott-upload__hint">{error ?? 'Try again'}</span>
          </>
        ) : (
          <>
            <span className="jott-upload__title">Drop image or click to choose</span>
            <span className="jott-upload__hint">PNG, JPG, GIF, WebP, SVG · up to 10 MB</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={onFileChange}
      />
      <button
        type="button"
        className="jott-upload__dismiss"
        onClick={() => deleteNode()}
        title="Remove"
        aria-label="Remove upload block"
      >
        ×
      </button>
    </NodeViewWrapper>
  );
}
