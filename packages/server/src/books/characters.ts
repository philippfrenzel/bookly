/** Character routes: create, update, delete. */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { CharacterBody } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { mutateBook } from '../db/mutate.js';
import { characters, sectionCharacters, storylineCharacters } from '../db/schema.js';
import { assertInBook } from './childId.js';
import { bookGuard } from './guard.js';

/** Registers the /api/books/:bookId/characters routes. */
export async function characterRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const base = '/api/books/:bookId/characters';

  app.post(base, guarded, async (request, reply) => {
    const parsed = CharacterBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const result = await mutateBook(app.db, bookId, async (tx) => {
      await tx.insert(characters).values({ bookId, name: parsed.data.name, description: parsed.data.description ?? null });
    });
    return reply.code(201).send(result);
  });

  app.patch(`${base}/:id`, guarded, async (request, reply) => {
    const parsed = CharacterBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, characters, id, bookId);
    return mutateBook(app.db, bookId, async (tx) => {
      const set: { name: string; description?: string | null } = { name: parsed.data.name };
      if (parsed.data.description !== undefined) set.description = parsed.data.description;
      await tx.update(characters).set(set).where(eq(characters.id, id));
    });
  });

  app.delete(`${base}/:id`, guarded, async (request) => {
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, characters, id, bookId);
    return mutateBook(app.db, bookId, async (tx) => {
      await tx.delete(storylineCharacters).where(eq(storylineCharacters.characterId, id));
      await tx.delete(sectionCharacters).where(eq(sectionCharacters.characterId, id));
      // connections.character_id is set to null by the foreign key.
      await tx.delete(characters).where(eq(characters.id, id));
    });
  });
}
