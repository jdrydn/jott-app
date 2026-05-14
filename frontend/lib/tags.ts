import type { EntryTagLink } from '@backend/trpc/routers/entries';
import type { TagWithStats } from '@backend/trpc/routers/tags';
import type { TagType } from '@shared/tags';

export type ResolvedTag = {
  type: TagType;
  name: string;
  initials: string;
  color: string;
};

export function buildLinkLookup(links: readonly EntryTagLink[]): Map<string, ResolvedTag> {
  const out = new Map<string, ResolvedTag>();
  for (const l of links) {
    out.set(`${l.tag.type}:${l.nameWhenLinked.toLowerCase()}`, {
      type: l.tag.type,
      name: l.tag.name,
      initials: l.tag.initials,
      color: l.tag.color,
    });
  }
  return out;
}

export function buildLiveLookup(allTags: readonly TagWithStats[]): Map<string, ResolvedTag> {
  const out = new Map<string, ResolvedTag>();
  for (const t of allTags) {
    out.set(`${t.type}:${t.name}`, {
      type: t.type,
      name: t.name,
      initials: t.initials,
      color: t.color,
    });
  }
  return out;
}

export function resolveToken(
  type: TagType,
  word: string,
  ...lookups: ReadonlyArray<Map<string, ResolvedTag>>
): ResolvedTag | undefined {
  const key = `${type}:${word.toLowerCase()}`;
  for (const lookup of lookups) {
    const hit = lookup.get(key);
    if (hit) return hit;
  }
  return undefined;
}
