import type { PMBlockNode, PMDoc, PMInlineNode, PMMark, PMNode } from './types';

export function docToMarkdown(doc: PMDoc): string {
  const out: string[] = [];
  for (const block of doc.content) {
    if (block.type === 'imageUpload') continue;
    const md = blockToMarkdown(block);
    if (md.length > 0) out.push(md);
  }
  return out.join('\n\n');
}

function blockToMarkdown(node: PMBlockNode): string {
  switch (node.type) {
    case 'paragraph':
      return inlineToMarkdown((node.content ?? []) as PMInlineNode[]);
    case 'horizontalRule':
      return '---';
    case 'image': {
      const src = (node.attrs?.src as string | undefined) ?? '';
      const alt = (node.attrs?.alt as string | undefined) ?? '';
      return `![${alt}](${src})`;
    }
    case 'imageUpload':
      // Placeholder node — never persisted to markdown.
      return '';
    case 'codeBlock': {
      const lang = (node.attrs?.language as string | null | undefined) ?? '';
      const text = (node.content ?? []).map(textOf).join('');
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case 'blockquote': {
      const inner = ((node.content as PMBlockNode[] | undefined) ?? [])
        .map((c) => blockToMarkdown(c))
        .join('\n\n');
      return inner
        .split('\n')
        .map((line) => (line.length > 0 ? `> ${line}` : '>'))
        .join('\n');
    }
    case 'bulletList':
      return listToMarkdown(node, { ordered: false, taskList: false });
    case 'orderedList':
      return listToMarkdown(node, { ordered: true, taskList: false });
    case 'taskList':
      return listToMarkdown(node, { ordered: false, taskList: true });
    default:
      return '';
  }
}

type ListOpts = { ordered: boolean; taskList: boolean };

function listToMarkdown(list: PMBlockNode, opts: ListOpts): string {
  const start = (list.attrs?.start as number | undefined) ?? 1;
  const items = (list.content ?? []) as PMBlockNode[];
  const lines: string[] = [];
  items.forEach((item, i) => {
    const markerCore = opts.ordered ? `${start + i}.` : '-';
    const prefix = opts.taskList
      ? `${markerCore} [${item.attrs?.checked ? 'x' : ' '}] `
      : `${markerCore} `;
    const indent = ' '.repeat(prefix.length);
    const inner = ((item.content as PMBlockNode[] | undefined) ?? [])
      .map((c) => blockToMarkdown(c))
      .join('\n\n');
    const innerLines = inner.split('\n');
    lines.push(prefix + (innerLines[0] ?? ''));
    for (let j = 1; j < innerLines.length; j++) {
      const line = innerLines[j] ?? '';
      lines.push(line.length > 0 ? indent + line : '');
    }
  });
  return lines.join('\n');
}

function inlineToMarkdown(nodes: PMInlineNode[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'hardBreak') {
      out += '  \n';
      continue;
    }
    if (n.type !== 'text') continue;
    out += wrapMarks(n.text, n.marks ?? []);
  }
  return out;
}

const MARK_RANK: Record<string, number> = {
  code: 0,
  link: 1,
  bold: 2,
  italic: 3,
  strike: 4,
};

function wrapMarks(text: string, marks: PMMark[]): string {
  const sorted = [...marks].sort((a, b) => (MARK_RANK[a.type] ?? 99) - (MARK_RANK[b.type] ?? 99));
  let s = text;
  for (const m of sorted) {
    switch (m.type) {
      case 'code':
        s = `\`${s}\``;
        break;
      case 'link':
        s = `[${s}](${(m.attrs?.href as string) ?? ''})`;
        break;
      case 'bold':
        s = `**${s}**`;
        break;
      case 'italic':
        s = `*${s}*`;
        break;
      case 'strike':
        s = `~~${s}~~`;
        break;
    }
  }
  return s;
}

function textOf(n: PMNode): string {
  return n.type === 'text' ? (n as PMInlineNode & { text: string }).text : '';
}
