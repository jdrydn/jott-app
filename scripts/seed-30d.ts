import { defaultColor, defaultInitials, formatTagRef } from '@shared/tags';
import { ulid } from 'ulid';
import { openDb } from '../backend/db/client';
import { entries, tags } from '../backend/db/schema';
import { reconcileEntryTags } from '../backend/tags/reconcile';

const DB_PATH = process.env.JOTTAPP_DB ?? `${process.cwd()}/jottapp-dev.db`;

// Multi-word names exercise the M8 autocomplete-create path. Single-word names
// stay parseable as bare `@name` tokens too — the reconciler handles both.
const PEOPLE = [
  'James Dryden',
  'John Davis',
  'Priya Kumar',
  'Maria Lopez',
  'Rachel Stone',
  'Alex Park',
  'Sam Chen',
  'Hannah Reed',
  'Marcus Cole',
  'Nina Brooks',
  'Ben Walters',
  'Liam OBrien',
];

const TOPICS = [
  'q3-plan',
  'q4-plan',
  'design-review',
  'mobile-app',
  'pricing',
  'analytics',
  'hiring',
  'standup',
  'renewal',
  'onboarding',
  'security',
  'roadmap',
  'infra',
  'launch',
  'retro',
];

type Pre = { id: string; ref: string };

const TEMPLATES: Array<(p: Pre, t: Pre) => string> = [
  (p, t) => `1:1 with ${p.ref} about ${t.ref}. Agreed on the next two milestones; doc to follow.`,
  (p, t) =>
    `Standup: ${p.ref} flagged a blocker on ${t.ref}. Pairing this afternoon to unstick it.`,
  (p, t) =>
    `${t.ref} review with ${p.ref} — looks good overall, two nits to clean up before merge.`,
  (_p, t) =>
    `Thinking out loud on ${t.ref}. Current approach feels right; rollout plan needs another pass.`,
  (p, t) =>
    `${p.ref} pushed back on the ${t.ref} scope. Their concern is fair — trimming to the core path for v1.`,
  (p, t) =>
    `Coffee with ${p.ref}. They want to take more ownership of ${t.ref} — green light, with a check-in next Friday.`,
  (p, t) =>
    `${t.ref} numbers came in higher than expected. Will dig in with ${p.ref} tomorrow before sharing widely.`,
  (p, _t) => `Quick note: ${p.ref} is OOO Monday. Reassign the morning review.`,
  (p, t) =>
    `Sync with ${p.ref} on ${t.ref}. Decision: ship the small win first, defer the larger refactor to next quarter.`,
  (p, t) =>
    `Drafted the ${t.ref} brief. Sent to ${p.ref} for a sanity check — quick turnaround expected.`,
  (p, t) =>
    `Heads-up from ${p.ref}: ${t.ref} is at risk for the milestone. Re-baselining tomorrow.`,
  (p, t) =>
    `Walked through ${t.ref} with ${p.ref}. The data story is clearer than I thought — leaning into it.`,
  (p, t) =>
    `Customer call with ${p.ref}. They love ${t.ref}, want a roadmap conversation about what's next.`,
  (_p, t) =>
    `Late afternoon: spent an hour on ${t.ref}. Wrote down the open questions so I can pick this back up tomorrow.`,
  (p, t) =>
    `Pairing with ${p.ref} on ${t.ref} — finally untangled the state-machine issue. Worth a short write-up.`,
];

function pick<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error('empty array');
  return item;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function main(): void {
  const { db, raw, close } = openDb(DB_PATH);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Wipe so repeated runs stay clean — the cascade on entry_tags + attachments
  // handles the rest. We don't touch profile / settings.
  raw.exec('DELETE FROM entry_tags');
  raw.exec('DELETE FROM entries');
  raw.exec('DELETE FROM tags');

  const now = Date.now();
  const peopleTags: Pre[] = PEOPLE.map((name) => {
    const id = ulid(now);
    db.insert(tags)
      .values({
        id,
        type: 'user',
        name,
        initials: defaultInitials(name),
        color: defaultColor(name),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id, ref: formatTagRef(id) };
  });
  const topicTags: Pre[] = TOPICS.map((name) => {
    const id = ulid(now);
    db.insert(tags)
      .values({
        id,
        type: 'topic',
        name,
        initials: defaultInitials(name),
        color: defaultColor(name),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id, ref: formatTagRef(id) };
  });

  let inserted = 0;
  db.transaction((tx) => {
    // Start at yesterday so "today" stays empty for the user's own first jott.
    for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
      const count = randInt(5, 8);
      const slots = new Set<number>();
      while (slots.size < count) {
        slots.add(randInt(0, 600)); // minute-of-window across 8am–6pm
      }
      const sortedSlots = [...slots].sort((a, b) => a - b);

      for (const slotMin of sortedSlots) {
        const day = new Date(startOfToday);
        day.setDate(day.getDate() - daysAgo);
        const hour = 8 + Math.floor(slotMin / 60);
        const minute = slotMin % 60;
        const second = randInt(0, 59);
        day.setHours(hour, minute, second, 0);
        const ts = day.getTime();

        const tmpl = pick(TEMPLATES);
        const body = tmpl(pick(peopleTags), pick(topicTags));
        const id = ulid(ts);
        tx.insert(entries)
          .values({ id, body, bodyRendered: '', createdAt: ts, updatedAt: ts })
          .run();
        // Reconcile rewrites the body (already canonical here), computes
        // body_rendered, and inserts entry_tags links.
        reconcileEntryTags(tx, id, body, ts);
        inserted++;
      }
    }
  });

  process.stdout.write(
    `seeded ${inserted} entries across 30 days + ${peopleTags.length} people + ${topicTags.length} topics into ${DB_PATH}\n`,
  );
  close();
}

main();
