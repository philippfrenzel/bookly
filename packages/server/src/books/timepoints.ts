/** Time point routes: insert, rename, reorder, delete. */
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ReorderBody, TimePointCreateBody, TimePointPatchBody, timePointUsages } from '@bookly/shared';
import type { Id, TimePointUsage } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { loadBook, type Tx } from '../db/loadBook.js';
import { mutateBook } from '../db/mutate.js';
import { timePoints } from '../db/schema.js';
import { assertInBook, assertKnownRefs } from './childId.js';
import { bookGuard } from './guard.js';

/** Thrown inside a mutation when a time point to delete is still referenced. */
class TimePointInUse extends Error {
  constructor(public readonly usages: TimePointUsage[]) {
    super('time point in use');
  }
}

/** Thrown inside a reorder when the ids are not a permutation of the book's time points. */
class InvalidOrder extends Error {
  constructor() {
    super('invalid order');
  }
}

/** Rewrites positions of the given ids as 0..n-1 in the given order. */
async function writePositions(tx: Tx, ids: Id[]): Promise<void> {
  for (const [position, id] of ids.entries()) {
    await tx.update(timePoints).set({ position }).where(eq(timePoints.id, id));
  }
}

/** Ids of the book's time points in position order. */
async function orderedIds(tx: Tx, bookId: Id): Promise<Id[]> {
  const rows = await tx
    .select({ id: timePoints.id })
    .from(timePoints)
    .where(eq(timePoints.bookId, bookId))
    .orderBy(asc(timePoints.position), asc(timePoints.id));
  return rows.map((r) => r.id);
}

/** Registers the /api/books/:bookId/timepoints routes. */
export async function timePointRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const base = '/api/books/:bookId/timepoints';

  app.post(base, guarded, async (request, reply) => {
    const parsed = TimePointCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const { name, afterId } = parsed.data;
    const result = await mutateBook(app.db, bookId, async (tx) => {
      const ids = await orderedIds(tx, bookId);
      let index = 0;
      if (afterId !== null) {
        await assertKnownRefs(tx, bookId, afterId, { timePointIds: [afterId] });
        index = ids.indexOf(afterId) + 1;
      }
      const [created] = await tx
        .insert(timePoints)
        .values({ bookId, name, position: ids.length })
        .returning({ id: timePoints.id });
      ids.splice(index, 0, created!.id);
      await writePositions(tx, ids);
    });
    return reply.code(201).send(result);
  });

  app.patch(`${base}/:id`, guarded, async (request, reply) => {
    const parsed = TimePointPatchBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, timePoints, id, bookId);
    return mutateBook(app.db, bookId, async (tx) => {
      await tx.update(timePoints).set({ name: parsed.data.name }).where(eq(timePoints.id, id));
    });
  });

  app.put(`${base}/order`, guarded, async (request, reply) => {
    const parsed = ReorderBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const { ids } = parsed.data;
    try {
      return await mutateBook(app.db, bookId, async (tx) => {
        const existing = new Set(await orderedIds(tx, bookId));
        if (ids.length !== existing.size || new Set(ids).size !== ids.length || !ids.every((i) => existing.has(i))) {
          throw new InvalidOrder();
        }
        await writePositions(tx, ids);
      });
    } catch (error) {
      if (error instanceof InvalidOrder) return reply.code(400).send({ error: 'invalid_order' });
      throw error;
    }
  });

  app.delete(`${base}/:id`, guarded, async (request, reply) => {
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, timePoints, id, bookId);
    try {
      return await mutateBook(app.db, bookId, async (tx) => {
        const usages = timePointUsages(await loadBook(tx, bookId), id);
        if (usages.length > 0) throw new TimePointInUse(usages);
        await tx.delete(timePoints).where(eq(timePoints.id, id));
        await writePositions(tx, await orderedIds(tx, bookId));
      });
    } catch (error) {
      if (error instanceof TimePointInUse) {
        return reply.code(409).send({ error: 'time_point_in_use', usages: error.usages });
      }
      throw error;
    }
  });
}
