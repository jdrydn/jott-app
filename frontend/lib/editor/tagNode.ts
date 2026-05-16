import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TagChipView, type TagLookup } from './tagChipView';

export interface TagNodeOptions {
  resolveTag: TagLookup;
}

declare module '@tiptap/core' {
  interface NodeViewRendererOptions {
    resolveTag?: TagLookup;
  }
}

export const TagNode = Node.create<TagNodeOptions>({
  name: 'tag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { resolveTag: () => undefined };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-jott-tag-id'),
        renderHTML: (attrs) => ({ 'data-jott-tag-id': attrs.id as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-jott-tag-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'jott-tag-node' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TagChipView, {
      // ReactNodeViewRenderer reads the editor's extension options via `extension`.
    });
  },
});
