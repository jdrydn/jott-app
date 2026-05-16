import type { Entry } from '../db/schema';

export type PromptContext = {
  name: string | null;
};

export function buildSummarisePrompt(entries: Entry[], ctx: PromptContext): string {
  return [
    preamble(ctx),
    'Task: Write a concise TL;DR (3-5 sentences) of what happened, what mattered, and any open threads. Refer to the user by name if natural.',
    '',
    'Entries (chronological):',
    formatEntries(entries),
  ].join('\n');
}

export function buildReflectPrompt(entries: Entry[], ctx: PromptContext): string {
  return [
    preamble(ctx),
    'Task: Identify recurring themes, patterns, or shifts in mood/focus. Output 5-8 short bullet points.',
    '',
    'Entries (chronological):',
    formatEntries(entries),
  ].join('\n');
}

export function buildAskPrompt(entries: Entry[], ctx: PromptContext, question: string): string {
  return [
    preamble(ctx),
    'Task: Answer the question below using only the journal entries provided. If the answer is not in the entries, say so plainly.',
    '',
    `Question: ${question.trim()}`,
    '',
    'Entries (chronological):',
    formatEntries(entries),
  ].join('\n');
}

function preamble(ctx: PromptContext): string {
  const owner = ctx.name?.trim() || 'the user';
  return `You are a journal assistant. The entries below are from ${owner}'s personal journal. Each entry is timestamped at creation; bodies are markdown. Hashtags (#topic) and mentions (@person) are ${owner}'s own tagging — preserve them in any quoting.`;
}

function formatEntries(entries: Entry[]): string {
  if (entries.length === 0) return '(no entries in this window)';
  return entries.map((e) => `## ${formatTimestamp(e.createdAt)}\n${e.body.trim()}`).join('\n\n');
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
