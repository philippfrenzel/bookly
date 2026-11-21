/** AI routes: forced character checks, character warning acknowledgements and the AI text route. */
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AiTextBody, CharacterWarningAckBody } from '@bookly/shared';
import type { AiTextResult, BookResponse, Id } from '@bookly/shared';
import type { AiRequest } from '../ai/client.js';
import { requireUser } from '../auth/session.js';
import { buildCheckInput } from '../ai/checkPrompt.js';
import { enqueueForced } from '../ai/queue.js';
import { withMentions } from '../ai/mentions.js';
import { loadSceneBlockContext, sceneBlockRequest } from '../ai/sceneBlockContext.js';
import { buildTextContext } from '../ai/textContext.js';
import { parseTextSuggestions, textRequest } from '../ai/textPrompt.js';
import { bookResponse } from '../db/bookResponse.js';
import { loadBook } from '../db/loadBook.js';
import { characterWarningAcks, characters, storylines } from '../db/schema.js';
import { assertInBook } from './childId.js';
import { bookGuard } from './guard.js';

/** preHandler: replies 503 `{ error: 'ai_disabled' }` when no AI client is configured. */
export async function requireAi(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.server.ai) await reply.code(503).send({ error: 'ai_disabled' });
}

/** Registers the character check, warning acknowledgement and AI text routes. */
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

  app.post('/api/books/:bookId/ai/text', aiGuarded, async (request, reply): Promise<AiTextResult | FastifyReply> => {
    const parsed = AiTextBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const body = parsed.data;
    const { target } = body;
    let aiRequest: AiRequest;
    if (target.kind === 'sceneBlock') {
      // Scene blocks are scoped to their assignment; generating is allowed on an empty block.
      const ctx = await loadSceneBlockContext(app.db, bookId, target.assignmentId, target.blockId);
      aiRequest = sceneBlockRequest(withMentions(ctx, ctx.characters, body.text), body);
    } else {
      const book = await loadBook(app.db, bookId);
      const ctx = buildTextContext(book, body);
      if (body.action === 'generate' && !ctx.hasText) return reply.code(400).send({ error: 'empty_context' });
      aiRequest = textRequest(withMentions(ctx, book.characters, body.text), body);
    }
    try {
      return { suggestions: parseTextSuggestions(await app.ai!.complete(aiRequest), body) };
    } catch (err) {
      request.log.warn({ err }, 'ai text suggestion failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
  });
}
