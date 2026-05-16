import type { TagType } from '@shared/tags';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';

export type ResolvedTag = {
  id: string;
  type: TagType;
  name: string;
  initials: string;
  color: string;
};

export type TagLookup = (id: string) => ResolvedTag | undefined;

export function TagChipView({ node, extension }: ReactNodeViewProps) {
  const id = (node.attrs.id as string | null) ?? '';
  const resolveTag = (extension.options.resolveTag as TagLookup | undefined) ?? (() => undefined);
  const tag = id ? resolveTag(id) : undefined;

  if (!tag) {
    return (
      <NodeViewWrapper
        as="span"
        className="jott-tag-node jott-tag-node--broken"
        data-jott-tag-id={id}
      >
        <span title="Tag not found" className="text-gray-400 italic dark:text-gray-500">
          {`{{ tag id=${id} }}`}
        </span>
      </NodeViewWrapper>
    );
  }

  const sigil = tag.type === 'topic' ? '#' : '@';
  return (
    <NodeViewWrapper as="span" className="jott-tag-node" data-jott-tag-id={id}>
      <span
        className="rounded px-1.5 py-0.5 font-medium"
        style={{ backgroundColor: tint(tag.color), color: tag.color }}
        contentEditable={false}
      >
        {sigil}
        {tag.name}
      </span>
    </NodeViewWrapper>
  );
}

function tint(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgba(148,163,184,0.15)';
  const n = parseInt(m[1] ?? '000000', 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}
