/** Drizzle schema for all bookly tables. Domain enums are stored as plain text. */
import { sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const books = pgTable('books', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: createdAt(),
  /** Bumped by every mutation of the book; drives "zuletzt bearbeitet" on the book list. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const timePoints = pgTable('time_points', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull(),
});

export const characters = pgTable('characters', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  name: text('name'),
  description: text('description'),
  behavior: text('behavior'),
  intentions: text('intentions'),
});

export const storylines = pgTable('storylines', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startId: uuid('start_id')
    .notNull()
    .references(() => timePoints.id, { onDelete: 'restrict' }),
  endId: uuid('end_id')
    .notNull()
    .references(() => timePoints.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  color: text('color').notNull(),
  note: text('note'),
});

export const sections = pgTable('sections', {
  id: id(),
  storylineId: uuid('storyline_id')
    .notNull()
    .references(() => storylines.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startId: uuid('start_id')
    .notNull()
    .references(() => timePoints.id, { onDelete: 'restrict' }),
  endId: uuid('end_id')
    .notNull()
    .references(() => timePoints.id, { onDelete: 'restrict' }),
  note: text('note'),
  order: integer('order').notNull(),
});

export const storylineCharacters = pgTable(
  'storyline_characters',
  {
    storylineId: uuid('storyline_id')
      .notNull()
      .references(() => storylines.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    behavior: text('behavior'),
    intentions: text('intentions'),
  },
  (t) => [primaryKey({ columns: [t.storylineId, t.characterId] })],
);

export const sectionCharacters = pgTable(
  'section_characters',
  {
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.characterId] })],
);

export const connections = pgTable('connections', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  fromId: uuid('from_id')
    .notNull()
    .references(() => storylines.id, { onDelete: 'cascade' }),
  toId: uuid('to_id')
    .notNull()
    .references(() => storylines.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  label: text('label'),
  characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
});

export const acknowledgements = pgTable(
  'acknowledgements',
  {
    id: id(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('acknowledgements_unique').on(
      t.connectionId,
      t.rule,
      sql`coalesce(${t.characterId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
  ],
);

/** Latest AI check state per storyline; `inputHash` is the hash of the last attempted input. */
export const characterChecks = pgTable('character_checks', {
  storylineId: uuid('storyline_id')
    .primaryKey()
    .references(() => storylines.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  inputHash: text('input_hash'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
  model: text('model'),
});

/** AI warnings about a storyline contradicting a character profile. */
export const characterWarnings = pgTable('character_warnings', {
  id: id(),
  storylineId: uuid('storyline_id')
    .notNull()
    .references(() => storylines.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  criterion: text('criterion').notNull(),
  message: text('message').notNull(),
  createdAt: createdAt(),
});

/** Acknowledgements that dampen future warnings of one criterion for a character in a storyline. */
export const characterWarningAcks = pgTable(
  'character_warning_acks',
  {
    storylineId: uuid('storyline_id')
      .notNull()
      .references(() => storylines.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    criterion: text('criterion').notNull(),
  },
  (t) => [primaryKey({ columns: [t.storylineId, t.characterId, t.criterion] })],
);
