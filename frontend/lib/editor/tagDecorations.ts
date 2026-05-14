import { TAG_REGEX, type TagType } from '@shared/tags';
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type TagResolver = (
  type: TagType,
  word: string,
) => { color: string; initials: string; name: string } | undefined;

export interface TagDecorationsOptions {
  resolveTag: TagResolver;
}

export const TAG_DECORATIONS_KEY = new PluginKey('jott:tagDecorations');

export const TagDecorations = Extension.create<TagDecorationsOptions>({
  name: 'tagDecorations',
  addOptions() {
    return { resolveTag: () => undefined };
  },
  addProseMirrorPlugins() {
    const resolveTag = (): TagResolver => this.options.resolveTag;
    return [
      new Plugin({
        key: TAG_DECORATIONS_KEY,
        props: {
          decorations(state) {
            return decorate(state.doc, resolveTag());
          },
        },
      }),
    ];
  },
});

function decorate(doc: PMNode, resolve: TagResolver): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(TAG_REGEX)) {
      const start = (m.index ?? 0) + pos;
      const end = start + m[0].length;
      const sigil = m[1] === '@' ? '@' : '#';
      const word = m[2] ?? '';
      const type: TagType = sigil === '#' ? 'topic' : 'user';
      const tag = resolve(type, word);
      const baseClass = sigil === '#' ? 'jott-chip jott-chip--topic' : 'jott-chip jott-chip--user';
      const attrs: Record<string, string> = {
        class: tag ? baseClass : `${baseClass} jott-chip--unresolved`,
      };
      if (tag) {
        attrs.style = `--jott-chip-color:${tag.color}`;
      }
      decorations.push(Decoration.inline(start, end, attrs));
    }
  });
  return DecorationSet.create(doc, decorations);
}
