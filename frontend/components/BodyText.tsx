import type { ReactNode } from 'react';

const TOKEN_RE = /([#@])(\w+)/g;

export function BodyText({ children }: { children: string }) {
  return <>{renderTokens(children)}</>;
}

function renderTokens(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(<Chip key={key++} sigil={match[1] as '#' | '@'} word={match[2] ?? ''} />);
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function Chip({ sigil, word }: { sigil: '#' | '@'; word: string }) {
  const cls = sigil === '#' ? 'bg-teal-50 text-teal-700' : 'bg-purple-50 text-purple-700';
  return (
    <span className={`rounded px-1.5 py-0.5 font-medium ${cls}`}>
      {sigil}
      {word}
    </span>
  );
}
