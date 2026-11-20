/** Acknowledgement routes: mark a current hint as "intentional" and undo it. */
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { AcknowledgementBody, checkBook, hintKey } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { loadBook } from '../db/loadBook.js';
import { acknowledgements, connections } from '../db/schema.js';
import { assertInBook } from './childId.js';
import { bookGuard } from './guard.js';

/** Registers the /api/books/:bookId/acknowledgements routes. */
export async function acknowledgementRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const path = '/api/books/:bookId/acknowledgements';

  app.post(path, guarded, async (request, reply) => {
    const parsed = AcknowledgementBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    await assertInBook(app.db, connections, d.connectionId, bookId);
    const wanted = hintKey(d);
    const hints = checkBook(await loadBook(app.db, bookId));
    if (!hints.some((h) => hintKey(h) === wanted)) return reply.code(400).send({ error: 'no_such_hint' });
    return app.mutate(bookId, async (tx) => {
      await tx
        .insert(acknowledgements)
        .values({ connectionId: d.connectionId, rule: d.rule, characterId: d.characterId })
        .onConflictDoNothing();
    });
  });

  app.delete(path, guarded, async (request, reply) => {
    const parsed = AcknowledgementBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    await assertInBook(app.db, connections, d.connectionId, bookId);
    return app.mutate(bookId, async (tx) => {
      await tx
        .delete(acknowledgements)
        .where(
          and(
            eq(acknowledgements.connectionId, d.connectionId),
            eq(acknowledgements.rule, d.rule),
            d.characterId === null ? isNull(acknowledgements.characterId) : eq(acknowledgements.characterId, d.characterId),
          ),
        );
    });
  });
}
