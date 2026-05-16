import type { EntryTagLink } from '@backend/trpc/routers/entries';
import { TAG_REF_REGEX } from '@shared/tags';
import type { ReactNode } from 'react';
import { lookupByLinks, type ResolvedTag } from '../lib/tags';

export type BodyTextProps = {
  children: string;
  links?: readonly EntryTagLink[];
  onTagClick?: (tagId: string) => void;
};

export function BodyText({ children, links, onTagClick }: BodyTextProps) {
  const lookup = links ? lookupByLinks(links) : undefined;
  return <>{renderTokens(children, lookup, onTagClick)}</>;
}

function renderTokens(
  text: string,
  lookup?: Map<string, ResolvedTag>,
  onTagClick?: (tagId: string) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(TAG_REF_REGEX)) {
    const start = match.index ?? 0;
    const id = match[1] ?? '';
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const resolved = lookup?.get(id);
    nodes.push(
      <Chip
        key={key++}
        marker={match[0]}
        resolved={resolved}
        onClick={resolved && onTagClick ? () => onTagClick(resolved.id) : undefined}
      />,
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function Chip({
  marker,
  resolved,
  onClick,
}: {
  marker: string;
  resolved?: ResolvedTag;
  onClick?: () => void;
}) {
  if (!resolved) {
    return (
      <span className="text-gray-400 italic dark:text-gray-500" title="Tag not found">
        {marker}
      </span>
    );
  }
  const sigil = resolved.type === 'topic' ? '#' : '@';
  const label = resolved.name;
  const interactive = onClick != null;

  if (sigil === '#') {
    const className = `rounded px-1.5 py-0.5 font-medium ${
      interactive ? 'cursor-pointer hover:brightness-95' : ''
    }`;
    const style = { backgroundColor: tint(resolved.color), color: resolved.color };
    if (interactive) {
      return (
        <button type="button" onClick={onClick} className={className} style={style}>
          #{label}
        </button>
      );
    }
    return (
      <span className={className} style={style}>
        #{label}
      </span>
    );
  }

  const innerStyle = { color: resolved.color };
  const inner = (
    <>
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] font-semibold uppercase text-white"
        style={{ backgroundColor: resolved.color }}
      >
        {resolved.initials}
      </span>
      <span className="font-medium" style={innerStyle}>
        @{label}
      </span>
    </>
  );
  const wrapClass = `inline-flex items-center gap-1 align-baseline ${
    interactive ? 'cursor-pointer hover:opacity-80' : ''
  }`;
  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={wrapClass}>
        {inner}
      </button>
    );
  }
  return <span className={wrapClass}>{inner}</span>;
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
