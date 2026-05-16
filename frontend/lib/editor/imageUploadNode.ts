import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageUploadView } from '../../components/ImageUploadNode';

export const ImageUploadNode = Node.create({
  name: 'imageUpload',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-jott-upload]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-jott-upload': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageUploadView);
  },
});
