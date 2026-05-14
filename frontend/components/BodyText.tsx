import type { EntryTagLink } from '@backend/trpc/routers/entries';
import { TAG_REGEX, type TagType } from '@shared/tags';
import type { ReactNode } from 'react';
import { buildLinkLookup, type ResolvedTag, resolveToken } from '../lib/tags';

export type BodyTextProps = {
  children: string;
  links?: readonly EntryTagLink[];
};

export function BodyText({ children, links }: BodyTextProps) {
  const lookup = links ? buildLinkLookup(links) : undefined;
  return <>{renderTokens(children, lookup)}</>;
}

function renderTokens(text: string, lookup?: Map<string, ResolvedTag>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(TAG_REGEX)) {
    const start = match.index ?? 0;
    const sigil = match[1] as '#' | '@';
    const word = match[2] ?? '';
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const type: TagType = sigil === '#' ? 'topic' : 'user';
    const resolved = lookup ? resolveToken(type, word, lookup) : undefined;
    nodes.push(<Chip key={key++} sigil={sigil} word={word} resolved={resolved} />);
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function Chip({
  sigil,
  word,
  resolved,
}: {
  sigil: '#' | '@';
  word: string;
  resolved?: ResolvedTag;
}) {
  if (!resolved) {
    return (
      <span className="text-gray-500" title="Tag not linked">
        {sigil}
        {word}
      </span>
    );
  }
  const label = resolved.name;
  if (sigil === '#') {
    return (
      <span
        className="rounded px-1.5 py-0.5 font-medium"
        style={{ backgroundColor: tint(resolved.color), color: resolved.color }}
      >
        #{label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 align-baseline">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] font-semibold uppercase text-white"
        style={{ backgroundColor: resolved.color }}
      >
        {resolved.initials}
      </span>
      <span className="font-medium" style={{ color: resolved.color }}>
        @{label}
      </span>
    </span>
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
