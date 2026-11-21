/**
 * Collaboration routes: comments on Bausteine, reviewer suggestions the author confirms (FR-023), per-Baustein
 * instructions (FR-018) and chapter-wise locking for editing a whole chapter (FR-012, FR-019).
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { CommentBody, InstructionBody, SuggestionBody, UUID_RE, lockActive } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { blockComments, blockSuggestions, blocks } from '../db/schema.js';
import { HttpError, mutateManuscript, needAuthor, needRight, workGuard } from './access.js';
import { assertNotLockedByOther, blockOf, chapterOf, lockedByOther, writeVersion } from './store.js';

/** Registers the collaboration routes under /api/books/:bookId/manuscript. */
export async function collabRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, workGuard] };
  const base = '/api/books/:bookId/manuscript';
  const invalid = (reply: FastifyReply, details: unknown) => reply.code(400).send({ error: 'invalid_body', details });
  type P = { bookId: string; blockId: string; chapterId: string; commentId: string; suggestionId: string; decision: string };

  // ---- comments ----

  app.post(`${base}/blocks/:blockId/comments`, guarded, async (request, reply) => {
    needRight(request, 'comment');
    const parsed = CommentBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, blockId } = request.params as P;
    const res = await mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      await tx.insert(blockComments).values({ blockId: row.id, authorId: request.user!.id, text: parsed.data.text });
    });
    return reply.code(201).send(res);
  });

  /** Own comments can be deleted; the author may delete any. */
  app.delete(`${base}/blocks/:blockId/comments/:commentId`, guarded, async (request) => {
    const { bookId, blockId, commentId } = request.params as P;
    if (!UUID_RE.test(commentId)) throw new HttpError(404, 'not_found');
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      const [c] = await tx.select().from(blockComments).where(and(eq(blockComments.id, commentId), eq(blockComments.blockId, row.id)));
      if (!c) throw new HttpError(404, 'not_found');
      if (c.authorId !== request.user!.id) needAuthor(request);
      await tx.delete(blockComments).where(eq(blockComments.id, c.id));
    });
  });

  // ---- suggestions (FR-023) ----

  /** A reviewer with the suggest right proposes new content; nothing changes until the author accepts. */
  app.post(`${base}/blocks/:blockId/suggestions`, guarded, async (request, reply) => {
    needRight(request, 'suggest');
    const parsed = SuggestionBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, blockId } = request.params as P;
    const d = parsed.data;
    const res = await mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      await tx.insert(blockSuggestions).values({
        blockId: row.id, authorId: request.user!.id, baseVersion: d.baseVersion, title: d.title, synopsis: d.synopsis, text: d.text, note: d.note ?? '', status: 'open',
      });
    });
    return reply.code(201).send(res);
  });

  /** The author accepts (the suggestion becomes the next version) or rejects; the proposer may withdraw (reject) their own. */
  app.post(`${base}/blocks/:blockId/suggestions/:suggestionId/:decision`, guarded, async (request) => {
    const { bookId, blockId, suggestionId, decision } = request.params as P;
    if (!UUID_RE.test(suggestionId) || (decision !== 'accept' && decision !== 'reject')) throw new HttpError(404, 'not_found');
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      const [sug] = await tx.select().from(blockSuggestions).where(and(eq(blockSuggestions.id, suggestionId), eq(blockSuggestions.blockId, row.id)));
      if (!sug) throw new HttpError(404, 'not_found');
      if (sug.status !== 'open') throw new HttpError(409, 'decided');
      if (decision === 'accept' || sug.authorId !== userId) needAuthor(request);
      if (decision === 'accept') {
        if (row.deletedAt) throw new HttpError(404, 'not_found');
        assertNotLockedByOther(row, userId);
        await writeVersion(tx, row, sug, 'suggestion', sug.authorId ?? userId);
      }
      await tx
        .update(blockSuggestions)
        .set({ status: decision === 'accept' ? 'accepted' : 'rejected', decidedAt: new Date() })
        .where(eq(blockSuggestions.id, sug.id));
    });
  });

  // ---- instruction (FR-018) ----

  app.put(`${base}/blocks/:blockId/instruction`, guarded, async (request, reply) => {
    needRight(request, 'edit');
    const parsed = InstructionBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, blockId } = request.params as P;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      assertNotLockedByOther(row, request.user!.id);
      await tx.update(blocks).set({ instruction: parsed.data.instruction }).where(eq(blocks.id, row.id));
    });
  });

  // ---- chapter-wise locking (FR-012, FR-019) ----

  /** Locks every live block of a chapter for the caller, all or none; 423 when any is locked by someone else. */
  app.post(`${base}/chapters/:chapterId/lock`, guarded, async (request) => {
    needRight(request, 'edit');
    const { bookId, chapterId } = request.params as P;
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const chapter = await chapterOf(tx, bookId, chapterId);
      if (chapter.deletedAt) throw new HttpError(404, 'not_found');
      const rows = await tx.select().from(blocks).where(and(eq(blocks.chapterId, chapter.id), isNull(blocks.deletedAt)));
      for (const r of rows) assertNotLockedByOther(r, userId);
      const now = new Date();
      for (const r of rows) {
        const ownActive = r.lockedBy === userId && r.lockedAt !== null && lockActive(r.lockedAt, now);
        if (!ownActive) await tx.update(blocks).set({ lockedBy: userId, lockedAt: now }).where(eq(blocks.id, r.id));
      }
    });
  });

  /** Releases the caller's own locks in the chapter (others' locks stay). */
  app.delete(`${base}/chapters/:chapterId/lock`, guarded, async (request) => {
    const { bookId, chapterId } = request.params as P;
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const chapter = await chapterOf(tx, bookId, chapterId);
      const rows = await tx.select().from(blocks).where(and(eq(blocks.chapterId, chapter.id), eq(blocks.lockedBy, userId)));
      for (const r of rows) if (!lockedByOther(r, userId)) await tx.update(blocks).set({ lockedBy: null, lockedAt: null }).where(eq(blocks.id, r.id));
    });
  });
}
