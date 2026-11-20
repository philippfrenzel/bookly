/** Per-storyline character additions: behaviour and intentions that apply only within one storyline. */
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { AdditionBody } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { characters, storylineCharacters, storylines } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { assertInBook } from './childId.js';
import { bookGuard } from './guard.js';

/** Registers the PUT .../storylines/:storylineId/characters/:characterId/addition route. */
export async function additionRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };

  app.put('/api/books/:bookId/storylines/:storylineId/characters/:characterId/addition', guarded, async (request, reply) => {
    const parsed = AdditionBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, storylineId, characterId } = request.params as { bookId: string; storylineId: string; characterId: string };
    await assertInBook(app.db, storylines, storylineId, bookId);
    await assertInBook(app.db, characters, characterId, bookId);
    return app.mutate(bookId, async (tx) => {
      // Omitted fields stay unchanged; null clears.
      const { behavior, intentions } = parsed.data;
      const set = {
        ...(behavior !== undefined && { behavior }),
        ...(intentions !== undefined && { intentions }),
      };
      const where = and(eq(storylineCharacters.storylineId, storylineId), eq(storylineCharacters.characterId, characterId));
      if (Object.keys(set).length === 0) {
        const [link] = await tx.select().from(storylineCharacters).where(where);
        if (!link) throw new NotFoundError();
        return;
      }
      const updated = await tx.update(storylineCharacters).set(set).where(where).returning({ id: storylineCharacters.characterId });
      if (updated.length === 0) throw new NotFoundError();
    });
  });
}
