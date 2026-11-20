/** Section routes: create, update, delete and reorder within a storyline. */
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ReorderBody, SectionCreateBody, SectionPatchBody, UUID_RE } from '@bookly/shared';
import type { Id } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import { mutateBook } from '../db/mutate.js';
import { sectionCharacters, sections, storylines } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { assertInBook, assertKnownRefs } from './childId.js';
import { bookGuard } from './guard.js';


/** Thrown inside a reorder when the ids are not a permutation of the strand's sections. */
class InvalidOrder extends Error {
  constructor() {
    super('invalid order');
  }
}

/** Throws NotFoundError unless `sectionId` is a well-formed uuid of a section in a storyline of `bookId`. */
async function assertSectionInBook(db: Db, sectionId: string, bookId: Id): Promise<void> {
  if (!UUID_RE.test(sectionId)) throw new NotFoundError();
  const [row] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(storylines, eq(storylines.id, sections.storylineId))
    .where(and(eq(sections.id, sectionId), eq(storylines.bookId, bookId)));
  if (!row) throw new NotFoundError();
}

/** Replaces the character set of a section. */
async function setCharacters(tx: Tx, sectionId: Id, characterIds: Id[]): Promise<void> {
  await tx.delete(sectionCharacters).where(eq(sectionCharacters.sectionId, sectionId));
  const unique = [...new Set(characterIds)];
  if (unique.length > 0) {
    await tx.insert(sectionCharacters).values(unique.map((characterId) => ({ sectionId, characterId })));
  }
}

/** Registers section routes under /api/books/:bookId. */
export async function sectionRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const base = '/api/books/:bookId';

  app.post(`${base}/storylines/:id/sections`, guarded, async (request, reply) => {
    const parsed = SectionCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, id: storylineId } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, storylines, storylineId, bookId);
    const d = parsed.data;
    const id = randomUUID();
    const result = await mutateBook(app.db, bookId, async (tx) => {
      await assertKnownRefs(tx, bookId, id, {
        timePointIds: [d.range.startId, d.range.endId],
        characterIds: d.characterIds,
      });
      const existing = await tx.select({ order: sections.order }).from(sections).where(eq(sections.storylineId, storylineId));
      const order = existing.reduce((max, s) => Math.max(max, s.order), -1) + 1;
      await tx.insert(sections).values({
        id,
        storylineId,
        title: d.title,
        description: d.description,
        startId: d.range.startId,
        endId: d.range.endId,
        note: d.note,
        order,
      });
      await setCharacters(tx, id, d.characterIds);
    });
    return reply.code(201).send(result);
  });

  app.patch(`${base}/sections/:sectionId`, guarded, async (request, reply) => {
    const parsed = SectionPatchBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, sectionId } = request.params as { bookId: string; sectionId: string };
    await assertSectionInBook(app.db, sectionId, bookId);
    const d = parsed.data;
    return mutateBook(app.db, bookId, async (tx) => {
      await assertKnownRefs(tx, bookId, sectionId, {
        timePointIds: d.range ? [d.range.startId, d.range.endId] : [],
        characterIds: d.characterIds ?? [],
      });
      const set: Partial<typeof sections.$inferInsert> = {};
      if (d.title !== undefined) set.title = d.title;
      if (d.description !== undefined) set.description = d.description;
      if (d.range) {
        set.startId = d.range.startId;
        set.endId = d.range.endId;
      }
      if (d.note !== undefined) set.note = d.note;
      if (Object.keys(set).length > 0) await tx.update(sections).set(set).where(eq(sections.id, sectionId));
      if (d.characterIds !== undefined) await setCharacters(tx, sectionId, d.characterIds);
    });
  });

  app.delete(`${base}/sections/:sectionId`, guarded, async (request) => {
    const { bookId, sectionId } = request.params as { bookId: string; sectionId: string };
    await assertSectionInBook(app.db, sectionId, bookId);
    return mutateBook(app.db, bookId, async (tx) => {
      await tx.delete(sections).where(eq(sections.id, sectionId));
    });
  });

  app.put(`${base}/storylines/:id/sections/order`, guarded, async (request, reply) => {
    const parsed = ReorderBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, id: storylineId } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, storylines, storylineId, bookId);
    const { ids } = parsed.data;
    try {
      return await mutateBook(app.db, bookId, async (tx) => {
        // Lock the strand so concurrent section changes cannot slip between check and write.
        await tx.select({ id: storylines.id }).from(storylines).where(eq(storylines.id, storylineId)).for('update');
        const rows = await tx
          .select({ id: sections.id })
          .from(sections)
          .where(eq(sections.storylineId, storylineId))
          .orderBy(asc(sections.order));
        const existing = new Set(rows.map((r) => r.id));
        if (ids.length !== existing.size || new Set(ids).size !== ids.length || !ids.every((i) => existing.has(i))) {
          throw new InvalidOrder();
        }
        for (const [order, sectionId] of ids.entries()) {
          await tx.update(sections).set({ order }).where(eq(sections.id, sectionId));
        }
      });
    } catch (error) {
      if (error instanceof InvalidOrder) return reply.code(400).send({ error: 'invalid_order' });
      throw error;
    }
  });
}
