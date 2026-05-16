import { ulid } from 'ulid';
import { openDb } from '../backend/db/client';
import { entries } from '../backend/db/schema';
import { reconcileEntryTags } from '../backend/tags/reconcile';

const DB_PATH = process.env.JOTTAPP_DB ?? `${process.cwd()}/jottapp-dev.db`;

const PEOPLE = [
  'priya',
  'john',
  'maria',
  'rachel',
  'alex',
  'sam',
  'hannah',
  'marcus',
  'nina',
  'ben',
  'james',
  'liam',
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

const TEMPLATES = [
  (p: string, t: string) =>
    `1:1 with @${p} about #${t}. Agreed on the next two milestones; she'll send a doc by EOW.`,
  (p: string, t: string) =>
    `Standup: @${p} flagged a blocker on #${t}. Pairing this afternoon to unstick it.`,
  (p: string, t: string) =>
    `#${t} review with @${p} — looks good overall, two nits to clean up before merge.`,
  (_p: string, t: string) =>
    `Thinking out loud on #${t}. The current approach feels right but the rollout plan needs another pass.`,
  (p: string, t: string) =>
    `@${p} pushed back on the #${t} scope. Their concern is fair — trimming to the core path for v1.`,
  (p: string, t: string) =>
    `Coffee with @${p}. They want to take more ownership of #${t} — green light, with a check-in next Friday.`,
  (p: string, t: string) =>
    `#${t} numbers came in higher than expected. Will dig in with @${p} tomorrow before sharing widely.`,
  (p: string, _t: string) => `Quick note: @${p} is OOO Monday. Reassign the morning review.`,
  (p: string, t: string) =>
    `Sync with @${p} on #${t}. Decision: ship the small win first, defer the larger refactor to next quarter.`,
  (p: string, t: string) =>
    `Drafted the #${t} brief. Sent to @${p} for a sanity check — quick turnaround expected.`,
  (p: string, t: string) =>
    `Heads-up from @${p}: #${t} is at risk for the milestone. Re-baselining tomorrow.`,
  (p: string, t: string) =>
    `Walked through #${t} with @${p}. The data story is clearer than I thought — leaning into it.`,
  (p: string, t: string) =>
    `Customer call with @${p}. They love #${t}, want a roadmap conversation about what's next.`,
  (_p: string, t: string) =>
    `Late afternoon: spent an hour on #${t}. Wrote down the open questions so I can pick this back up tomorrow.`,
  (p: string, t: string) =>
    `Pairing with @${p} on #${t} — finally untangled the state-machine issue. Worth a short write-up.`,
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
  const { db, close } = openDb(DB_PATH);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let inserted = 0;
  try {
    db.transaction((tx) => {
      for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
        const count = randInt(5, 8);
        // Spread entries across 8:00 – 18:00 (10 hours = 36000s).
        const slots = new Set<number>();
        while (slots.size < count) {
          slots.add(randInt(0, 600)); // minute-of-window (0..600 = 10h)
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
          const body = tmpl(pick(PEOPLE), pick(TOPICS));
          const id = ulid(ts);
          tx.insert(entries)
            .values({ id, body, createdAt: ts, updatedAt: ts })
            .run();
          reconcileEntryTags(tx, id, body, ts);
          inserted++;
        }
      }
    });
    process.stdout.write(`seeded ${inserted} entries across 30 days into ${DB_PATH}\n`);
  } finally {
    close();
  }
}

main();
