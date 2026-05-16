import type { EntryTagLink } from '@backend/trpc/routers/entries';
import type { TagWithStats } from '@backend/trpc/routers/tags';
import type { TagType } from '@shared/tags';

export type ResolvedTag = {
  id: string;
  type: TagType;
  name: string;
  initials: string;
  color: string;
};

// Per-entry tag links carry the live tag row (joined at query time), so the
// lookup just maps id → row.
export function lookupByLinks(links: readonly EntryTagLink[]): Map<string, ResolvedTag> {
  const out = new Map<string, ResolvedTag>();
  for (const l of links) out.set(l.tag.id, l.tag);
  return out;
}

// Editor-time lookup over the full tag list (used while typing).
export function lookupByLiveTags(allTags: readonly TagWithStats[]): Map<string, ResolvedTag> {
  const out = new Map<string, ResolvedTag>();
  for (const t of allTags) {
    out.set(t.id, {
      id: t.id,
      type: t.type,
      name: t.name,
      initials: t.initials,
      color: t.color,
    });
  }
  return out;
}
