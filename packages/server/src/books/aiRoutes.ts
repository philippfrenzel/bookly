/** AI routes: forced character checks, character warning acknowledgements and profile suggestions. */
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CharacterWarningAckBody, SuggestionBody } from '@bookly/shared';
import type { Book, BookResponse, Character, Id } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { buildCheckInput } from '../ai/checkPrompt.js';
import { enqueueForced } from '../ai/queue.js';
import { parseSuggestion, suggestRequest, type SuggestContext } from '../ai/suggestPrompt.js';
import { bookResponse } from '../db/bookResponse.js';
import { loadBook } from '../db/loadBook.js';
import { characterWarningAcks, characters, storylines } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { assertInBook } from './childId.js';
import { bookGuard } from './guard.js';

/** preHandler: replies 503 `{ error: 'ai_disabled' }` when no AI client is configured. */
async function requireAi(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.server.ai) await reply.code(503).send({ error: 'ai_disabled' });
}

/** The stored character merged with the draft; draft values (including null) win over stored ones. */
function mergeDraft(character: Character, draft: SuggestionBody): SuggestionBody {
  const pick = <K extends keyof SuggestionBody>(k: K) => (draft[k] !== undefined ? draft[k] : character[k]);
  return { name: pick('name'), description: pick('description'), behavior: pick('behavior'), intentions: pick('intentions') };
}

/** Finds a character of the loaded book or throws NotFoundError. */
function findCharacter(book: Book, characterId: string): Character {
  const character = book.characters.find((c) => c.id === characterId);
  if (!character) throw new NotFoundError();
  return character;
}

/** Registers the character check, warning acknowledgement and suggestion routes. */
export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const aiGuarded = { preHandler: [requireUser, bookGuard(), requireAi] };

  /** Forces checks of the given storylines that have input, then returns the fresh response. */
  async function force(bookId: Id, storylineIds: Id[]): Promise<BookResponse> {
    const book = await loadBook(app.db, bookId);
    await enqueueForced(app.db, storylineIds.filter((id) => buildCheckInput(book, id) !== null));
    return bookResponse(app.db, book, true);
  }

  app.post('/api/books/:bookId/storylines/:storylineId/character-check', aiGuarded, async (request) => {
    const { bookId, storylineId } = request.params as { bookId: string; storylineId: string };
    await assertInBook(app.db, storylines, storylineId, bookId);
    return force(bookId, [storylineId]);
  });

  app.post('/api/books/:bookId/character-checks', aiGuarded, async (request) => {
    const { bookId } = request.params as { bookId: string };
    const book = await loadBook(app.db, bookId);
    return force(bookId, book.storylines.map((s) => s.id));
  });

  const ackPath = '/api/books/:bookId/character-warning-acks';

  app.post(ackPath, guarded, async (request, reply) => {
    const parsed = CharacterWarningAckBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    await assertInBook(app.db, storylines, d.storylineId, bookId);
    await assertInBook(app.db, characters, d.characterId, bookId);
    const line = (await loadBook(app.db, bookId)).storylines.find((s) => s.id === d.storylineId)!;
    const linked = line.characterIds.includes(d.characterId) || line.sections.some((s) => s.characterIds.includes(d.characterId));
    if (!linked) return reply.code(400).send({ error: 'not_linked' });
    return app.mutate(bookId, async (tx) => {
      await tx.insert(characterWarningAcks).values(d).onConflictDoNothing();
    });
  });

  app.delete(ackPath, guarded, async (request, reply) => {
    const parsed = CharacterWarningAckBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    await assertInBook(app.db, storylines, d.storylineId, bookId);
    await assertInBook(app.db, characters, d.characterId, bookId);
    return app.mutate(bookId, async (tx) => {
      await tx.delete(characterWarningAcks).where(and(
        eq(characterWarningAcks.storylineId, d.storylineId),
        eq(characterWarningAcks.characterId, d.characterId),
        eq(characterWarningAcks.criterion, d.criterion),
      ));
    });
  });

  /** Calls the model; replies 502 `{ error: 'ai_failed' }` on any failure. */
  async function suggest(request: FastifyRequest, reply: FastifyReply, ctx: SuggestContext) {
    try {
      return parseSuggestion(await app.ai!.complete(suggestRequest(ctx)));
    } catch (err) {
      request.log.warn({ err }, 'character suggestion failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
  }

  app.post('/api/books/:bookId/characters/:characterId/suggestion', aiGuarded, async (request, reply) => {
    const parsed = SuggestionBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, characterId } = request.params as { bookId: string; characterId: string };
    await assertInBook(app.db, characters, characterId, bookId);
    const character = findCharacter(await loadBook(app.db, bookId), characterId);
    return suggest(request, reply, { character: mergeDraft(character, parsed.data) });
  });

  app.post(
    '/api/books/:bookId/storylines/:storylineId/characters/:characterId/suggestion',
    aiGuarded,
    async (request, reply) => {
      const parsed = SuggestionBody.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
      const { bookId, storylineId, characterId } = request.params as { bookId: string; storylineId: string; characterId: string };
      await assertInBook(app.db, storylines, storylineId, bookId);
      await assertInBook(app.db, characters, characterId, bookId);
      const book = await loadBook(app.db, bookId);
      const line = book.storylines.find((s) => s.id === storylineId)!;
      if (!line.characterIds.includes(characterId)) throw new NotFoundError();
      const sections = [...line.sections].sort((a, b) => a.order - b.order);
      return suggest(request, reply, {
        character: mergeDraft(findCharacter(book, characterId), parsed.data),
        storyline: {
          title: line.title,
          description: line.description,
          note: line.note ?? '',
          sections: sections.map((s) => ({ title: s.title, description: s.description })),
        },
      });
    },
  );
}
