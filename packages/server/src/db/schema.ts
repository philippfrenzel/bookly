/** Drizzle schema for all bookly tables. Domain enums are stored as plain text. */
import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  integer,
  jsonb,
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

/** PostgreSQL bytea mapped to a Node Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/** Scenes (places/settings) of a book. */
export const scenes = pgTable('scenes', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

/** The optional single image of a scene; kept out of the book aggregate and served by its own route. */
export const sceneImages = pgTable('scene_images', {
  sceneId: uuid('scene_id')
    .primaryKey()
    .references(() => scenes.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  data: bytea('data').notNull(),
  size: integer('size').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Text notes of a scene, ordered by position. */
export const sceneNotes = pgTable('scene_notes', {
  id: id(),
  sceneId: uuid('scene_id')
    .notNull()
    .references(() => scenes.id, { onDelete: 'cascade' }),
  text: text('text').notNull().default(''),
  position: integer('position').notNull(),
  createdAt: createdAt(),
});

/** A scene assigned to a section with that section's scene description; one per scene and section. */
export const sceneAssignments = pgTable(
  'scene_assignments',
  {
    id: id(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id, { onDelete: 'cascade' }),
    /** Target is either a section (of a main strand) or a whole storyline (e.g. a side strand); exactly one is set. */
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),
    storylineId: uuid('storyline_id').references(() => storylines.id, { onDelete: 'cascade' }),
    description: text('description').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scene_assignments_unique').on(t.sceneId, t.sectionId),
    uniqueIndex('scene_assignments_storyline_unique').on(t.sceneId, t.storylineId),
    check('scene_assignments_one_target', sql`(${t.sectionId} IS NULL) <> (${t.storylineId} IS NULL)`),
  ],
);

/** Reviewers (Lektoren) of a book with their individual rights (FR-005, BR-001); at most 5 per book. */
export const bookReviewers = pgTable(
  'book_reviewers',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rights: text('rights').array().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.bookId, t.userId] })],
);

/** Chapters of a book's manuscript; soft deleted via `deletedAt`. */
export const chapters = pgTable('chapters', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  createdAt: createdAt(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deleteComment: text('delete_comment'),
});

/** Bausteine: scene-level text units inside a chapter; the row holds the current content, `block_versions` every version. */
export const blocks = pgTable('blocks', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id')
    .notNull()
    .references(() => chapters.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull().default(''),
  text: text('text').notNull().default(''),
  version: integer('version').notNull().default(1),
  sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
  storylineId: uuid('storyline_id').references(() => storylines.id, { onDelete: 'set null' }),
  sceneIds: uuid('scene_ids').array().notNull().default(sql`'{}'::uuid[]`),
  instruction: text('instruction').notNull().default(''),
  lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deleteComment: text('delete_comment'),
});

/** Every version of every block, never deleted (FR-004). */
export const blockVersions = pgTable(
  'block_versions',
  {
    id: id(),
    blockId: uuid('block_id')
      .notNull()
      .references(() => blocks.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    synopsis: text('synopsis').notNull(),
    text: text('text').notNull(),
    reason: text('reason').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('block_versions_unique').on(t.blockId, t.version)],
);

/** AI structure proposals; `payload` holds the proposed chapters. */
export const structureProposals = pgTable('structure_proposals', {
  id: id(),
  bookId: uuid('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  summary: text('summary').notNull().default(''),
  payload: jsonb('payload').notNull(),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

/** Comments on blocks (reviewer right „Kommentieren“). */
export const blockComments = pgTable('block_comments', {
  id: id(),
  blockId: uuid('block_id')
    .notNull()
    .references(() => blocks.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  createdAt: createdAt(),
});

/** Reviewer suggestions for a block's content; status open, accepted or rejected (FR-023). */
export const blockSuggestions = pgTable('block_suggestions', {
  id: id(),
  blockId: uuid('block_id')
    .notNull()
    .references(() => blocks.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  baseVersion: integer('base_version').notNull(),
  title: text('title').notNull(),
  synopsis: text('synopsis').notNull(),
  text: text('text').notNull(),
  note: text('note').notNull().default(''),
  status: text('status').notNull(),
  createdAt: createdAt(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});
