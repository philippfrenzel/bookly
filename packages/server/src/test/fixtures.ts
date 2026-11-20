/** Direct-DB fixtures for tests that need rows the API cannot create yet. */
import type { FastifyInstance } from 'fastify';
import type { Id } from '@bookly/shared';
import { characters, connections, storylines, timePoints } from '../db/schema.js';

/** Inserts time points named after `names` (positions 0..n-1) and returns their ids in order. */
export async function seedTimePoints(app: FastifyInstance, bookId: Id, names = ['T0', 'T1', 'T2']): Promise<Id[]> {
  const rows = await app.db
    .insert(timePoints)
    .values(names.map((name, position) => ({ bookId, name, position })))
    .returning({ id: timePoints.id });
  return rows.map((r) => r.id);
}

/** Inserts a storyline spanning startId..endId and returns its id. */
export async function seedStoryline(
  app: FastifyInstance,
  bookId: Id,
  startId: Id,
  endId: Id,
  title = 'Strang',
): Promise<Id> {
  const [row] = await app.db
    .insert(storylines)
    .values({ bookId, title, startId, endId, kind: 'main', status: 'in_progress', color: '#2B59C3' })
    .returning({ id: storylines.id });
  return row!.id;
}

/** Inserts a character and returns its id. */
export async function seedCharacter(app: FastifyInstance, bookId: Id, name = 'Figur'): Promise<Id> {
  const [row] = await app.db.insert(characters).values({ bookId, name }).returning({ id: characters.id });
  return row!.id;
}

/** Inserts a connection between two storylines and returns its id. */
export async function seedConnection(
  app: FastifyInstance,
  bookId: Id,
  fromId: Id,
  toId: Id,
  type: string,
  characterId: Id | null = null,
): Promise<Id> {
  const [row] = await app.db
    .insert(connections)
    .values({ bookId, fromId, toId, type, characterId })
    .returning({ id: connections.id });
  return row!.id;
}
