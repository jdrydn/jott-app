import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey().notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    body: text('body').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('entries_created_at_idx').on(t.createdAt)],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
