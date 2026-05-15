import type { EntryTagLink } from '@backend/trpc/routers/entries';
import type { ReactNode } from 'react';
import { BodyText } from '../../components/BodyText';
import { markdownToDoc } from './toProseMirror';
import type { PMBlockNode, PMInlineNode, PMMark } from './types';

type ViewProps = {
  links?: readonly EntryTagLink[];
  onTagClick?: (tagId: string) => void;
};

export function MarkdownView({ body, links, onTagClick }: { body: string } & ViewProps) {
  const doc = markdownToDoc(body);
  return (
    <>
      {doc.content.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nodes are derived from a stable body
        <BlockView key={i} node={block} links={links} onTagClick={onTagClick} />
      ))}
    </>
  );
}

function BlockView({ node, links, onTagClick }: { node: PMBlockNode } & ViewProps): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          <Inline
            nodes={(node.content ?? []) as PMInlineNode[]}
            links={links}
            onTagClick={onTagClick}
          />
        </p>
      );
    case 'horizontalRule':
      return <hr className="my-3 border-t border-gray-200 dark:border-gray-800" />;
    case 'codeBlock': {
      const text = ((node.content ?? []) as PMInlineNode[])
        .map((c) => (c.type === 'text' ? c.text : ''))
        .join('');
      return (
        <pre className="rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-800 overflow-x-auto dark:bg-gray-800 dark:text-gray-200">
          <code>{text}</code>
        </pre>
      );
    }
    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-gray-300 pl-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
          {((node.content as PMBlockNode[] | undefined) ?? []).map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: nodes are derived from a stable body
            <BlockView key={i} node={c} links={links} onTagClick={onTagClick} />
          ))}
        </blockquote>
      );
    case 'bulletList':
      return (
        <ul className="list-disc pl-5 text-sm text-gray-800 space-y-1 dark:text-gray-200">
          {((node.content as PMBlockNode[] | undefined) ?? []).map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: nodes are derived from a stable body
            <ListItemView key={i} node={item} links={links} onTagClick={onTagClick} />
          ))}
        </ul>
      );
    case 'orderedList': {
      const start = (node.attrs?.start as number | undefined) ?? 1;
      return (
        <ol
          start={start}
          className="list-decimal pl-5 text-sm text-gray-800 space-y-1 dark:text-gray-200"
        >
          {((node.content as PMBlockNode[] | undefined) ?? []).map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: nodes are derived from a stable body
            <ListItemView key={i} node={item} links={links} onTagClick={onTagClick} />
          ))}
        </ol>
      );
    }
    case 'taskList':
      return (
        <ul className="space-y-1 text-sm text-gray-800 dark:text-gray-200">
          {((node.content as PMBlockNode[] | undefined) ?? []).map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: nodes are derived from a stable body
            <TaskItemView key={i} node={item} links={links} onTagClick={onTagClick} />
          ))}
        </ul>
      );
    default:
      return null;
  }
}

function ListItemView({ node, links, onTagClick }: { node: PMBlockNode } & ViewProps) {
  return (
    <li>
      {((node.content as PMBlockNode[] | undefined) ?? []).map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nodes are derived from a stable body
        <BlockView key={i} node={c} links={links} onTagClick={onTagClick} />
      ))}
    </li>
  );
}

function TaskItemView({ node, links, onTagClick }: { node: PMBlockNode } & ViewProps) {
  const checked = !!node.attrs?.checked;
  return (
    <li className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mt-1 h-3.5 w-3.5 cursor-default rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:[color-scheme:dark]"
      />
      <div className="flex-1">
        {((node.content as PMBlockNode[] | undefined) ?? []).map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: nodes are derived from a stable body
          <BlockView key={i} node={c} links={links} onTagClick={onTagClick} />
        ))}
      </div>
    </li>
  );
}

function Inline({ nodes, links, onTagClick }: { nodes: PMInlineNode[] } & ViewProps): ReactNode {
  const out: ReactNode[] = [];
  nodes.forEach((n, i) => {
    if (n.type === 'hardBreak') {
      // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes derived from a stable body
      out.push(<br key={i} />);
      return;
    }
    if (n.type !== 'text') return;
    const marks = n.marks ?? [];
    const isCode = marks.some((m) => m.type === 'code');
    const inner: ReactNode = isCode ? (
      n.text
    ) : (
      // biome-ignore lint/correctness/useJsxKeyInIterable: this element is wrapped by MarkedSpan below
      <BodyText links={links} onTagClick={onTagClick}>
        {n.text}
      </BodyText>
    );
    out.push(
      // biome-ignore lint/suspicious/noArrayIndexKey: inline nodes derived from a stable body
      <MarkedSpan key={i} marks={marks}>
        {inner}
      </MarkedSpan>,
    );
  });
  return <>{out}</>;
}

function MarkedSpan({ marks, children }: { marks: PMMark[]; children: ReactNode }): ReactNode {
  let node: ReactNode = children;
  // Apply marks innermost-first: code, link, bold, italic, strike
  const order: ReadonlyArray<string> = ['code', 'link', 'bold', 'italic', 'strike'];
  for (const type of order) {
    const m = marks.find((mm) => mm.type === type);
    if (!m) continue;
    switch (type) {
      case 'code':
        node = (
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-gray-800 dark:text-gray-200">
            {node}
          </code>
        );
        break;
      case 'link':
        node = (
          <a
            href={(m.attrs?.href as string) ?? '#'}
            className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            target="_blank"
            rel="noreferrer noopener"
          >
            {node}
          </a>
        );
        break;
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'strike':
        node = <s>{node}</s>;
        break;
    }
  }
  return node;
}
