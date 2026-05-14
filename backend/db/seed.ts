import { ulid } from 'ulid';
import { reconcileEntryTags } from '../tags/reconcile';
import type { Db } from './client';
import { entries } from './schema';

type Fixture = {
  daysAgo: number;
  hour: number;
  minute: number;
  body: string;
};

const FIXTURES: Fixture[] = [
  {
    daysAgo: 1,
    hour: 13,
    minute: 45,
    body:
      "Long retro session with @priya, @john and @maria on the last release — way over what I expected so I'm dumping it all here before the next call.\n\n" +
      'Key decisions: ship the empty-state changes ahead of the rest, push the data-export work to Q4, revisit pricing at the next exec sync.\n\n' +
      'Action items spread across the team — see the doc.\n\n' +
      'Follow-up retros booked for next sprint.',
  },
  {
    daysAgo: 1,
    hour: 12,
    minute: 0,
    body:
      '@priya + @rachel on #q3-plan. Cutting the data-export work to make room for #security SOC2 prep. ' +
      'Priya OK, Rachel wants to revisit at next exec sync.',
  },
  {
    daysAgo: 1,
    hour: 11,
    minute: 15,
    body:
      '#design-review with @alex — the new tag picker on #mobile-app is good but the touch target on chip-remove is too small. ' +
      'Action: bump to 32×32. Otherwise ship it.',
  },
  {
    daysAgo: 1,
    hour: 10,
    minute: 30,
    body:
      '1:1 with @maria on #onboarding redesign. She wants to ship the empty-state changes ahead of the rest — agree, low risk. ' +
      '#design-review booked Thursday.',
  },
  {
    daysAgo: 1,
    hour: 9,
    minute: 42,
    body:
      '@james pushed back on the new #pricing tiers. Wants enterprise carve-out documented before sharing with their board. ' +
      "Said the per-seat math doesn't work above 500 users — promised a worked example by Thursday.",
  },
  {
    daysAgo: 1,
    hour: 9,
    minute: 5,
    body:
      "Quick #standup — @sam flagged the deploy pipeline is still flaky after Friday's migration. " +
      '@john taking it on today.',
  },
  {
    daysAgo: 2,
    hour: 16,
    minute: 15,
    body:
      '#hiring sync with @hannah. Two strong candidates for the senior eng role, scheduling onsites next week. ' +
      "Pipeline for design is thin — she's opening the search.",
  },
  {
    daysAgo: 2,
    hour: 14,
    minute: 30,
    body:
      '@marcus called to follow up on the #pricing doc. Confirmed Northwind will sign once the redlines are back from their legal team. ' +
      'ETA Wednesday.',
  },
  {
    daysAgo: 2,
    hour: 11,
    minute: 0,
    body:
      '@rachel kicked off the #analytics dashboard refactor. ' +
      'Need to land the schema migration before the #q3-plan lock.',
  },
  {
    daysAgo: 2,
    hour: 10,
    minute: 0,
    body:
      '@nina (Lighthouse) — #renewal conversation. Happy with the product but want a discount for the second year. ' +
      'Sent her to @ben. Loved the new #analytics dashboards — said it was the only feature she actively wanted.',
  },
];

export const DEMO_ENTRY_COUNT = FIXTURES.length;

export function seedDemoData(db: Db, now: Date = new Date()): number {
  for (const f of FIXTURES) {
    const day = new Date(now);
    day.setDate(day.getDate() - f.daysAgo);
    day.setHours(f.hour, f.minute, 0, 0);
    const ts = day.getTime();
    const id = ulid(ts);
    db.insert(entries)
      .values({
        id,
        body: f.body,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    reconcileEntryTags(db, id, f.body, ts);
  }
  return FIXTURES.length;
}
