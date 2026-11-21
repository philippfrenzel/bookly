/**
 * The magic wand on a manuscript Baustein (text and plan): the same text actions as everywhere else, with the block's
 * chapter, plan, author instruction, style and neighbouring text as context. Open to everyone with the edit right
 * (author and reviewers who may edit), unlike /api/books/:bookId/ai/text, which is for the book's owner only.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { AiTextBody } from '@bookly/shared';
import type { AiTextResult, ManuscriptResponse } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { requireAi } from '../books/aiRoutes.js';
import { withMentions } from '../ai/mentions.js';
import { styleText } from '../ai/stylePrompt.js';
import type { TextContext } from '../ai/textContext.js';
import { parseTextSuggestions, textRequest } from '../ai/textPrompt.js';
import { loadBook } from '../db/loadBook.js';
import { HttpError, manuscriptFor, needRight, workGuard } from './access.js';
import { blockOf } from './store.js';

/** Character budgets of the context parts. */
const BEFORE_MAX = 1500;
const AFTER_MAX = 800;
/** "Fortsetzen" on the whole text only needs its end; long blocks would otherwise go to the model in full. */
export const CONTINUE_TAIL = 4000;

const BLOCK_RULE =
  'Der Text ist ein Baustein eines Romanmanuskripts (Prosa). Bearbeite nur diesen Baustein; textDavor und textDanach sind Umgebung und werden nie wiederholt oder verändert. Halte dich an kontext.stil, falls vorhanden, und an kontext.bausteinAnweisung der Autorin.';
const PLAN_RULE = 'Das Feld ist der Inhalt (Plan) eines Bausteins: knappe Arbeitsnotizen, was in diesem Abschnitt passiert.';

/** Text, plan, instruction and neighbours of one block, as the model context for `field`. */
export function blockContext(
  ms: ManuscriptResponse,
  blockId: string,
  field: 'text' | 'synopsis',
  draft: { title?: string; description?: string },
): TextContext | null {
  const flat = ms.chapters.flatMap((c) => c.blocks.map((b) => ({ ...b, chapterTitle: c.title })));
  const i = flat.findIndex((b) => b.id === blockId);
  const block = flat[i];
  if (!block) return null;
  const style = styleText(ms.style, ms.teamStyles);
  return {
    fieldLabel: field === 'text' ? 'Bausteintext' : 'Inhalt (Plan)',
    hasText: true,
    context: {
      buch: ms.book.title,
      kapitel: block.chapterTitle,
      baustein: draft.title ?? block.title,
      ...(field === 'text' && { inhalt: draft.description ?? block.synopsis }),
      ...(block.instruction && { bausteinAnweisung: block.instruction }),
      ...(field === 'text' && style && { stil: style }),
      textDavor: (flat[i - 1]?.text ?? '').slice(-BEFORE_MAX),
      ...(field === 'text' && { textDanach: (flat[i + 1]?.text ?? '').slice(0, AFTER_MAX) }),
    },
  };
}

/** Registers the manuscript wand route. */
export async function manuscriptAiTextRoutes(app: FastifyInstance): Promise<void> {
  const aiGuarded = { preHandler: [requireUser, workGuard, requireAi] };

  app.post('/api/books/:bookId/manuscript/blocks/:blockId/ai-text', aiGuarded, async (request, reply): Promise<AiTextResult | FastifyReply> => {
    needRight(request, 'edit');
    const parsed = AiTextBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const body = parsed.data;
    const { bookId, blockId } = request.params as { bookId: string; blockId: string };
    if (body.target.kind !== 'manuscriptBlock' || body.target.blockId !== blockId) return reply.code(400).send({ error: 'invalid_target' });
    const row = await blockOf(app.db, bookId, blockId);
    if (row.deletedAt) throw new HttpError(404, 'not_found');
    const [ms, book] = await Promise.all([manuscriptFor(app, request), loadBook(app.db, bookId)]);
    const ctx = blockContext(ms, blockId, body.target.field, body.draft);
    if (!ctx) throw new HttpError(404, 'not_found');
    if (body.action === 'generate' && !body.draft.title?.trim() && !(body.target.field === 'text' && body.draft.description?.trim())) {
      return reply.code(400).send({ error: 'empty_context' });
    }
    // Continue at the end of a long block: the model sees only the end of the text.
    const sent = body.action === 'continue' && !body.selection && body.text.length > CONTINUE_TAIL ? { ...body, text: body.text.slice(-CONTINUE_TAIL) } : body;
    const req = textRequest(withMentions(ctx, book.characters, body.text), sent);
    const rule = body.target.field === 'text' ? BLOCK_RULE : PLAN_RULE;
    try {
      return { suggestions: parseTextSuggestions(await app.ai!.complete({ ...req, system: `${req.system}\n${rule}` }), body) };
    } catch (err) {
      request.log.warn({ err }, 'ai manuscript text suggestion failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
  });
}
