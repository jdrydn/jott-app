import { TAG_REF_REGEX } from '@shared/tags';
import { marked, type Tokens } from 'marked';
import type { PMBlockNode, PMDoc, PMInlineNode, PMMark, PMNode } from './types';

type AnyToken = Tokens.Generic & {
  tokens?: AnyToken[];
  items?: AnyToken[];
  text?: string;
  raw?: string;
  ordered?: boolean;
  start?: number;
  task?: boolean;
  checked?: boolean;
  lang?: string;
  href?: string;
};

export function markdownToDoc(md: string): PMDoc {
  const tokens = marked.lexer(md) as AnyToken[];
  return { type: 'doc', content: tokensToBlocks(tokens) };
}

function tokensToBlocks(tokens: AnyToken[]): PMBlockNode[] {
  const out: PMBlockNode[] = [];
  for (const t of tokens) {
    if (t.type === 'paragraph' || t.type === 'heading') {
      for (const block of paragraphToBlocks(t.tokens ?? [])) out.push(block);
      continue;
    }
    const node = tokenToBlock(t);
    if (node) out.push(node);
  }
  return out;
}

// Splits a paragraph's inline tokens around any image tokens so each image
// becomes its own block-level node (matching the editor's block-only image
// extension). Text on either side of an image stays in its own paragraph.
function paragraphToBlocks(tokens: AnyToken[]): PMBlockNode[] {
  const out: PMBlockNode[] = [];
  let buf: AnyToken[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    const inline = inlineTokens(buf);
    if (inline.length > 0) out.push({ type: 'paragraph', content: inline });
    buf = [];
  };
  for (const tk of tokens) {
    if (tk.type === 'image') {
      flush();
      out.push({
        type: 'image',
        attrs: {
          src: tk.href ?? '',
          alt: tk.text ?? null,
          title: (tk as { title?: string }).title ?? null,
        },
      });
    } else {
      buf.push(tk);
    }
  }
  flush();
  if (out.length === 0) out.push({ type: 'paragraph', content: [] });
  return out;
}

function tokenToBlock(t: AnyToken): PMBlockNode | null {
  switch (t.type) {
    case 'space':
      return null;
    case 'paragraph':
      return { type: 'paragraph', content: inlineTokens(t.tokens ?? []) };
    case 'heading':
      return { type: 'paragraph', content: inlineTokens(t.tokens ?? []) };
    case 'code': {
      const text = t.text ?? '';
      const language = t.lang ?? null;
      return {
        type: 'codeBlock',
        attrs: { language },
        content: text.length > 0 ? [{ type: 'text', text } as PMInlineNode] : [],
      };
    }
    case 'blockquote':
      return { type: 'blockquote', content: tokensToBlocks(t.tokens ?? []) };
    case 'hr':
      return { type: 'horizontalRule' };
    case 'list':
      return listToken(t);
    case 'text':
      return { type: 'paragraph', content: inlineTokens(t.tokens ?? [t]) };
    default:
      return null;
  }
}

function listToken(t: AnyToken): PMBlockNode {
  const items = t.items ?? [];
  const isTaskList = items.length > 0 && items.every((it) => it.task);
  const listType = isTaskList ? 'taskList' : t.ordered ? 'orderedList' : 'bulletList';
  const attrs: Record<string, unknown> = {};
  if (listType === 'orderedList' && typeof t.start === 'number' && t.start !== 1) {
    attrs.start = t.start;
  }
  const content = items.map((it) => itemNode(it, isTaskList));
  const node: PMBlockNode = { type: listType, content };
  if (Object.keys(attrs).length > 0) node.attrs = attrs;
  return node;
}

function itemNode(item: AnyToken, isTaskList: boolean): PMBlockNode {
  const blocks = itemBlocks(item.tokens ?? []);
  if (isTaskList) {
    return {
      type: 'taskItem',
      attrs: { checked: !!item.checked },
      content: blocks,
    };
  }
  return { type: 'listItem', content: blocks };
}

const BLOCK_TYPES = new Set(['paragraph', 'list', 'blockquote', 'code', 'hr', 'heading']);

function itemBlocks(tokens: AnyToken[]): PMBlockNode[] {
  const hasBlock = tokens.some((t) => BLOCK_TYPES.has(t.type));
  if (hasBlock) {
    return tokensToBlocks(tokens);
  }
  return [{ type: 'paragraph', content: inlineTokens(tokens) }];
}

function inlineTokens(tokens: AnyToken[]): PMNode[] {
  const out: PMNode[] = [];
  for (const tk of tokens) pushInline(out, tk, []);
  return out;
}

function pushInline(out: PMNode[], tk: AnyToken, marks: PMMark[]): void {
  switch (tk.type) {
    case 'text':
    case 'escape': {
      const text = tk.text ?? '';
      if (text.length === 0) return;
      // Split out canonical {{ tag id=ULID }} markers into inline atom nodes.
      pushTextWithTags(out, text, marks);
      return;
    }
    case 'strong':
      for (const c of tk.tokens ?? []) pushInline(out, c, [...marks, { type: 'bold' }]);
      return;
    case 'em':
      for (const c of tk.tokens ?? []) pushInline(out, c, [...marks, { type: 'italic' }]);
      return;
    case 'del':
      for (const c of tk.tokens ?? []) pushInline(out, c, [...marks, { type: 'strike' }]);
      return;
    case 'codespan': {
      out.push(textNode(tk.text ?? '', [...marks, { type: 'code' }]));
      return;
    }
    case 'link': {
      const link: PMMark = { type: 'link', attrs: { href: tk.href ?? '' } };
      const children = tk.tokens ?? [];
      if (children.length === 0 && tk.text) {
        out.push(textNode(tk.text, [...marks, link]));
        return;
      }
      for (const c of children) pushInline(out, c, [...marks, link]);
      return;
    }
    case 'br':
      out.push({ type: 'hardBreak' });
      return;
    case 'image':
      // Images are promoted to block-level in paragraphToBlocks; an image that
      // slips through here (e.g. inside a list item) is silently dropped.
      return;
    case 'html':
      if (tk.text) out.push(textNode(tk.text, marks));
      return;
    default:
      if (typeof tk.text === 'string' && tk.text.length > 0) {
        out.push(textNode(tk.text, marks));
      }
  }
}

function textNode(text: string, marks: PMMark[]): PMInlineNode {
  return marks.length > 0 ? { type: 'text', text, marks: [...marks] } : { type: 'text', text };
}

function pushTextWithTags(out: PMNode[], text: string, marks: PMMark[]): void {
  let last = 0;
  for (const m of text.matchAll(TAG_REF_REGEX)) {
    const start = m.index ?? 0;
    if (start > last) out.push(textNode(text.slice(last, start), marks));
    const id = m[1];
    if (id) out.push({ type: 'tag', attrs: { id } });
    last = start + m[0].length;
  }
  if (last === 0) {
    out.push(textNode(text, marks));
    return;
  }
  if (last < text.length) out.push(textNode(text.slice(last), marks));
}
