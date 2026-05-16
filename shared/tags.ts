export type TagType = 'topic' | 'user';

// Bare-token regex: matches literal `#word` / `@word` the user typed.
// Used by the editor to detect autocomplete triggers and by the reconciler
// to auto-promote bare tokens to `{{ tag id=ULID }}` markers on save.
export const TAG_REGEX = /(?<![A-Za-z0-9_-])([#@])([A-Za-z][A-Za-z0-9_-]*)/g;

// Canonical body reference: `{{ tag id=ULID }}` — the on-disk shape after
// reconcile. ULID character set is Crockford base32 (excludes I, L, O, U).
export const TAG_REF_REGEX = /\{\{\s*tag\s+id=([0-9A-HJKMNP-TV-Z]{26})\s*\}\}/g;

const PALETTE: readonly string[] = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

export type BareTag = { type: TagType; name: string };

export function extractBareTags(body: string): BareTag[] {
  const seen = new Map<string, BareTag>();
  for (const m of body.matchAll(TAG_REGEX)) {
    const sigil = m[1];
    const word = m[2];
    if (!sigil || !word) continue;
    const type: TagType = sigil === '#' ? 'topic' : 'user';
    const name = word.toLowerCase();
    const key = `${type}:${name}`;
    if (!seen.has(key)) {
      seen.set(key, { type, name });
    }
  }
  return [...seen.values()];
}

export function extractTagRefs(body: string): string[] {
  const ids: string[] = [];
  for (const m of body.matchAll(TAG_REF_REGEX)) {
    const id = m[1];
    if (id) ids.push(id);
  }
  return ids;
}

export function formatTagRef(id: string): string {
  return `{{ tag id=${id} }}`;
}

export function renderBody(
  body: string,
  byId: ReadonlyMap<string, { type: TagType; name: string }>,
): string {
  return body.replace(TAG_REF_REGEX, (full, id: string) => {
    const tag = byId.get(id);
    if (!tag) return full;
    return `${tag.type === 'topic' ? '#' : '@'}${tag.name}`;
  });
}

export function defaultInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  }
  const single = words[0] ?? name.trim();
  return single.slice(0, 2).toUpperCase() || '??';
}

export function defaultColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % PALETTE.length;
  return PALETTE[idx] ?? (PALETTE[0] as string);
}

export function tagSigil(type: TagType): '#' | '@' {
  return type === 'topic' ? '#' : '@';
}
