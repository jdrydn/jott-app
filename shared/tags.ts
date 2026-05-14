export type TagType = 'topic' | 'user';

export const TAG_REGEX = /(?<![A-Za-z0-9_-])([#@])([A-Za-z][A-Za-z0-9_-]*)/g;

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

export type ExtractedTag = {
  type: TagType;
  name: string;
  nameWhenLinked: string;
};

export function extractTags(body: string): ExtractedTag[] {
  const seen = new Map<string, ExtractedTag>();
  for (const m of body.matchAll(TAG_REGEX)) {
    const sigil = m[1];
    const word = m[2];
    if (!sigil || !word) continue;
    const type: TagType = sigil === '#' ? 'topic' : 'user';
    const name = word.toLowerCase();
    const key = `${type}:${name}`;
    if (!seen.has(key)) {
      seen.set(key, { type, name, nameWhenLinked: word });
    }
  }
  return [...seen.values()];
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
