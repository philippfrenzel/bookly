/**
 * AI structure proposals (author only, on request: FR-001, FR-003, FR-020) and the AI prose draft of a Baustein.
 * Accepting a proposal applies it in one transaction; rejecting only marks it.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ProposalRequestBody, UUID_RE } from '@bookly/shared';
import type { Id, ProposalChapter } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { draftRequest, parseDraft, parseStructure, structureRequest } from '../ai/structurePrompt.js';
import { loadBook, type Tx } from '../db/loadBook.js';
import { loadScenes } from '../db/loadScenes.js';
import { blocks, chapters, structureProposals } from '../db/schema.js';
import { requireAi } from '../books/aiRoutes.js';
import { HttpError, manuscriptFor, mutateManuscript, needAuthor, needRight, workGuard } from './access.js';
import { loadManuscript } from './load.js';
import { blockOf, insertBlock, liveBlockIds, liveChapterIds, writeBlockOrder, writeChapterOrder } from './store.js';

/** Applies an accepted proposal: listed chapters and blocks first in the proposed order, everything unlisted keeps its place after them. */
export async function applyProposal(tx: Tx, bookId: Id, proposal: ProposalChapter[], userId: Id): Promise<void> {
  const liveChapters = new Set(await liveChapterIds(tx, bookId));
  const chapterOrder: Id[] = [];
  const placed = new Set<Id>();
  for (const c of proposal) {
    let chapterId = c.chapterId && liveChapters.has(c.chapterId) ? c.chapterId : null;
    if (chapterId) await tx.update(chapters).set({ title: c.title }).where(eq(chapters.id, chapterId));
    else chapterId = (await tx.insert(chapters).values({ bookId, title: c.title, position: 0 }).returning({ id: chapters.id }))[0]!.id;
    chapterOrder.push(chapterId);
    const order: Id[] = [];
    for (const b of c.blocks) {
      if (b.blockId) {
        const [row] = await tx
          .select({ id: blocks.id, chapterId: blocks.chapterId })
          .from(blocks)
          .where(and(eq(blocks.id, b.blockId), eq(blocks.bookId, bookId), isNull(blocks.deletedAt)));
        if (!row || !liveChapters.has(row.chapterId) || placed.has(row.id)) continue;
        order.push(row.id);
        placed.add(row.id);
      } else {
        const id = await insertBlock(tx, { bookId, chapterId, title: b.title, synopsis: b.synopsis, text: '', sectionId: b.sectionId, storylineId: b.storylineId, sceneIds: b.sceneIds }, userId);
        order.push(id);
        placed.add(id);
      }
    }
    const rest = (await liveBlockIds(tx, chapterId)).filter((id) => !order.includes(id));
    await writeBlockOrder(tx, chapterId, [...order, ...rest]);
  }
  // Blocks moved away from an unlisted chapter leave gaps; close them.
  const allLive = await liveChapterIds(tx, bookId);
  for (const id of allLive.filter((x) => !chapterOrder.includes(x))) {
    await writeBlockOrder(tx, id, await liveBlockIds(tx, id));
  }
  await writeChapterOrder(tx, [...chapterOrder, ...allLive.filter((x) => !chapterOrder.includes(x))]);
}

/** Registers proposal and draft routes. */
export async function proposalRoutes(app: FastifyInstance): Promise<void> {
  const aiGuarded = { preHandler: [requireUser, workGuard, requireAi] };
  const guarded = { preHandler: [requireUser, workGuard] };
  const base = '/api/books/:bookId/manuscript';

  /** Asks the AI for a structure; it is stored as an open proposal, older open ones are replaced. */
  app.post(`${base}/proposals`, aiGuarded, async (request, reply: FastifyReply) => {
    needAuthor(request);
    const parsed = ProposalRequestBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const [book, sceneData, current] = await Promise.all([
      loadBook(app.db, bookId),
      loadScenes(app.db, bookId),
      loadManuscript(app.db, bookId, request.user!.id, request.work!, true),
    ]);
    if (book.storylines.length === 0) return reply.code(400).send({ error: 'no_storylines' });
    let result;
    try {
      const raw = await app.ai!.complete(structureRequest(book, { scenes: sceneData.scenes, assignments: sceneData.sceneAssignments }, current.chapters, parsed.data.wish));
      result = parseStructure(raw, {
        chapters: new Set(current.chapters.map((c) => c.id)),
        blocks: new Set(current.chapters.flatMap((c) => c.blocks.map((b) => b.id))),
        sections: new Set(book.storylines.flatMap((l) => l.sections.map((s) => s.id))),
        storylines: new Set(book.storylines.map((l) => l.id)),
        scenes: new Set(sceneData.scenes.map((s) => s.id)),
      });
    } catch (err) {
      request.log.warn({ err }, 'ai structure proposal failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
    const res = await mutateManuscript(app, request, async (tx) => {
      await tx
        .update(structureProposals)
        .set({ status: 'replaced', decidedAt: new Date() })
        .where(and(eq(structureProposals.bookId, bookId), eq(structureProposals.status, 'open')));
      await tx.insert(structureProposals).values({
        bookId,
        kind: current.chapters.length === 0 ? 'initial' : 'adjust',
        status: 'open',
        summary: result.summary,
        payload: result.chapters,
      });
    });
    return reply.code(201).send(res);
  });

  /** The author decides: accept applies the proposal, reject drops it (FR-003). */
  app.post(`${base}/proposals/:proposalId/:decision`, guarded, async (request) => {
    needAuthor(request);
    const { bookId, proposalId, decision } = request.params as { bookId: string; proposalId: string; decision: string };
    if (!UUID_RE.test(proposalId) || (decision !== 'accept' && decision !== 'reject')) throw new HttpError(404, 'not_found');
    return mutateManuscript(app, request, async (tx) => {
      const [p] = await tx
        .select()
        .from(structureProposals)
        .where(and(eq(structureProposals.id, proposalId), eq(structureProposals.bookId, bookId)));
      if (!p) throw new HttpError(404, 'not_found');
      if (p.status !== 'open') throw new HttpError(409, 'decided');
      if (decision === 'accept') await applyProposal(tx, bookId, p.payload as ProposalChapter[], request.user!.id);
      await tx
        .update(structureProposals)
        .set({ status: decision === 'accept' ? 'accepted' : 'rejected', decidedAt: new Date() })
        .where(eq(structureProposals.id, p.id));
    });
  });

  /** A prose draft for one block from its plan, source, figures and scenes; nothing is saved. */
  app.post(`${base}/blocks/:blockId/draft`, aiGuarded, async (request, reply) => {
    needRight(request, 'edit');
    const { bookId, blockId } = request.params as { bookId: string; blockId: string };
    const row = await blockOf(app.db, bookId, blockId);
    if (row.deletedAt) throw new HttpError(404, 'not_found');
    const [book, sceneData, ms] = await Promise.all([loadBook(app.db, bookId), loadScenes(app.db, bookId), manuscriptFor(app, request)]);
    const chapter = ms.chapters.find((c) => c.id === row.chapterId);
    const flat = ms.chapters.flatMap((c) => c.blocks);
    const prev = flat[flat.findIndex((b) => b.id === row.id) - 1];
    const section = book.storylines.flatMap((l) => l.sections).find((s) => s.id === row.sectionId);
    const line = book.storylines.find((l) => l.id === (row.storylineId ?? section?.storylineId));
    const charIds = section?.characterIds ?? line?.characterIds ?? [];
    const sceneIds = new Set([
      ...row.sceneIds,
      ...sceneData.sceneAssignments.filter((a) => (section ? a.sectionId === section.id : a.storylineId === line?.id)).map((a) => a.sceneId),
    ]);
    try {
      const raw = await app.ai!.complete(draftRequest({
        bookTitle: book.title,
        chapterTitle: chapter?.title ?? '',
        title: row.title,
        synopsis: row.synopsis,
        source: section ? { title: section.title, description: section.description } : line ? { title: line.title, description: line.description } : null,
        characters: book.characters.filter((c) => charIds.includes(c.id)).map((c) => ({ name: c.name ?? 'Unbenannt', description: c.description ?? '' })),
        scenes: sceneData.scenes.filter((s) => sceneIds.has(s.id)).map((s) => ({
          name: s.name,
          description: sceneData.sceneAssignments.find((a) => a.sceneId === s.id && (a.sectionId === section?.id || a.storylineId === line?.id))?.description ?? '',
        })),
        previousText: prev?.text.slice(-1500) ?? '',
      }));
      return { text: parseDraft(raw) };
    } catch (err) {
      request.log.warn({ err }, 'ai block draft failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
  });
}
