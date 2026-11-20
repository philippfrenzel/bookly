/** Connection routes: create, update, delete. Hints never block saving. */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ConnectionCreateBody, ConnectionPatchBody } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { mutateBook } from '../db/mutate.js';
import { connections } from '../db/schema.js';
import { assertInBook, assertKnownRefs } from './childId.js';
import { bookGuard } from './guard.js';

/** Registers the /api/books/:bookId/connections routes. */
export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const base = '/api/books/:bookId/connections';

  app.post(base, guarded, async (request, reply) => {
    const parsed = ConnectionCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    const id = randomUUID();
    const result = await mutateBook(app.db, bookId, async (tx) => {
      await assertKnownRefs(tx, bookId, id, {
        storylineIds: [d.fromId, d.toId],
        characterIds: d.characterId ? [d.characterId] : [],
      });
      await tx.insert(connections).values({
        id,
        bookId,
        fromId: d.fromId,
        toId: d.toId,
        type: d.type,
        label: d.label,
        characterId: d.characterId,
      });
    });
    return reply.code(201).send(result);
  });

  app.patch(`${base}/:id`, guarded, async (request, reply) => {
    const parsed = ConnectionPatchBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, connections, id, bookId);
    const d = parsed.data;
    return mutateBook(app.db, bookId, async (tx) => {
      await assertKnownRefs(tx, bookId, id, { characterIds: d.characterId ? [d.characterId] : [] });
      const set: Partial<typeof connections.$inferInsert> = {};
      if (d.type !== undefined) set.type = d.type;
      if (d.label !== undefined) set.label = d.label;
      if (d.characterId !== undefined) set.characterId = d.characterId;
      if (Object.keys(set).length > 0) await tx.update(connections).set(set).where(eq(connections.id, id));
    });
  });

  app.delete(`${base}/:id`, guarded, async (request) => {
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, connections, id, bookId);
    // Acknowledgements are removed by the foreign key cascade.
    return mutateBook(app.db, bookId, async (tx) => {
      await tx.delete(connections).where(eq(connections.id, id));
    });
  });
}
