/** Loads a complete book aggregate from the database. */
import { asc, eq, inArray } from 'drizzle-orm';
import type { Book, ConnectionType, HintRule, Id, StorylineKind, StorylineStatus } from '@bookly/shared';
import type { Db } from './client.js';
import {
  acknowledgements,
  books,
  characters,
  connections,
  sectionCharacters,
  sections,
  storylineCharacters,
  storylines,
  timePoints,
} from './schema.js';

/** A transaction handle, usable like a Db for queries. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Groups rows by key into a map of arrays. */
function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Loads the full aggregate; time points sorted by position, sections by order. Throws if the book is missing. */
export async function loadBook(db: Db | Tx, bookId: Id): Promise<Book> {
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  if (!book) throw new Error(`book ${bookId} not found`);
  const tps = await db.select().from(timePoints).where(eq(timePoints.bookId, bookId)).orderBy(asc(timePoints.position));
  const chars = await db
    .select()
    .from(characters)
    .where(eq(characters.bookId, bookId))
    .orderBy(asc(characters.name), asc(characters.id));
  const lines = await db
    .select()
    .from(storylines)
    .where(eq(storylines.bookId, bookId))
    .orderBy(asc(storylines.title), asc(storylines.id));
  const lineIds = lines.map((l) => l.id);
  const secs = lineIds.length
    ? await db.select().from(sections).where(inArray(sections.storylineId, lineIds)).orderBy(asc(sections.order))
    : [];
  const lineChars = lineIds.length
    ? await db.select().from(storylineCharacters).where(inArray(storylineCharacters.storylineId, lineIds))
    : [];
  const secIds = secs.map((s) => s.id);
  const secChars = secIds.length
    ? await db.select().from(sectionCharacters).where(inArray(sectionCharacters.sectionId, secIds))
    : [];
  const conns = await db.select().from(connections).where(eq(connections.bookId, bookId)).orderBy(asc(connections.id));
  const connIds = conns.map((c) => c.id);
  const acks = connIds.length
    ? await db.select().from(acknowledgements).where(inArray(acknowledgements.connectionId, connIds))
    : [];

  const lineCharsBy = groupBy(lineChars, (r) => r.storylineId);
  const secCharsBy = groupBy(secChars, (r) => r.sectionId);
  const secsBy = groupBy(secs, (r) => r.storylineId);

  return {
    id: book.id,
    title: book.title,
    timePoints: tps.map((t) => ({ id: t.id, name: t.name, position: t.position })),
    characters: chars.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    storylines: lines.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      characterIds: (lineCharsBy.get(l.id) ?? []).map((r) => r.characterId),
      range: { startId: l.startId, endId: l.endId },
      kind: l.kind as StorylineKind,
      status: l.status as StorylineStatus,
      color: l.color,
      note: l.note,
      sections: (secsBy.get(l.id) ?? []).map((s) => ({
        id: s.id,
        storylineId: s.storylineId,
        title: s.title,
        description: s.description,
        characterIds: (secCharsBy.get(s.id) ?? []).map((r) => r.characterId),
        range: { startId: s.startId, endId: s.endId },
        note: s.note,
        order: s.order,
      })),
    })),
    connections: conns.map((c) => ({
      id: c.id,
      fromId: c.fromId,
      toId: c.toId,
      type: c.type as ConnectionType,
      label: c.label,
      characterId: c.characterId,
    })),
    acknowledgements: acks.map((a) => ({
      connectionId: a.connectionId,
      rule: a.rule as HintRule,
      characterId: a.characterId,
    })),
  };
}
