import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey().notNull(),
    type: text('type', { enum: ['topic', 'user'] }).notNull(),
    name: text('name').notNull(),
    initials: text('initials').notNull(),
    color: text('color').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('tags_type_name_idx').on(t.type, t.name)],
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TagType = Tag['type'];

export const entryTags = sqliteTable(
  'entry_tags',
  {
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    nameWhenLinked: text('name_when_linked').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.tagId] }),
    index('entry_tags_tag_id_idx').on(t.tagId),
  ],
);

export type EntryTag = typeof entryTags.$inferSelect;
export type NewEntryTag = typeof entryTags.$inferInsert;

export const profile = sqliteTable('profile', {
  id: text('id').primaryKey().notNull().$type<'me'>(),
  name: text('name').notNull(),
  theme: text('theme', { enum: ['light', 'dark', 'system'] })
    .notNull()
    .default('system'),
  createdAt: integer('created_at').notNull(),
});

export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type ProfileTheme = Profile['theme'];

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey().notNull(),
    entryId: text('entry_id').references(() => entries.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['image'] }).notNull(),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('attachments_entry_id_idx').on(t.entryId)],
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type AttachmentKind = Attachment['kind'];
