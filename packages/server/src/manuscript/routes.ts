/**
 * Manuscript routes: read, chapters and Bausteine (create, edit, move, soft delete, restore), versions and locks.
 * Every mutation answers with the caller's fresh ManuscriptResponse.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { BlockCreateBody, BlockPatchBody, ChapterCreateBody, ChapterPatchBody, DeleteBody, MoveBody, lockActive } from '@bookly/shared';
import type { BlockVersion } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { blockVersions, blocks, chapters, users } from '../db/schema.js';
import { HttpError, manuscriptFor, mutateManuscript, needAuthor, needRight, workGuard } from './access.js';
import {
  assertNotLockedByOther,
  blockOf,
  chapterOf,
  insertBlock,
  liveBlockIds,
  liveChapterIds,
  lockedByOther,
  placeAt,
  writeBlockOrder,
  writeChapterOrder,
  writeVersion,
} from './store.js';

/** Registers the manuscript routes under /api/books/:bookId/manuscript. */
export async function manuscriptRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, workGuard] };
  const base = '/api/books/:bookId/manuscript';
  const invalid = (reply: FastifyReply, details: unknown) => reply.code(400).send({ error: 'invalid_body', details });
  type P = { bookId: string; chapterId: string; blockId: string; version: string };

  app.get(base, guarded, async (request) => manuscriptFor(app, request));

  // ---- chapters (structure right) ----

  app.post(`${base}/chapters`, guarded, async (request, reply) => {
    needRight(request, 'structure');
    const parsed = ChapterCreateBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId } = request.params as P;
    const res = await mutateManuscript(app, request, async (tx) => {
      const order = await liveChapterIds(tx, bookId);
      const [row] = await tx.insert(chapters).values({ bookId, title: parsed.data.title, position: order.length }).returning({ id: chapters.id });
      if (parsed.data.position !== undefined) await writeChapterOrder(tx, placeAt([...order, row!.id], row!.id, parsed.data.position));
    });
    return reply.code(201).send(res);
  });

  app.patch(`${base}/chapters/:chapterId`, guarded, async (request, reply) => {
    needRight(request, 'structure');
    const parsed = ChapterPatchBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, chapterId } = request.params as P;
    return mutateManuscript(app, request, async (tx) => {
      const row = await chapterOf(tx, bookId, chapterId);
      await tx.update(chapters).set({ title: parsed.data.title }).where(eq(chapters.id, row.id));
    });
  });

  app.post(`${base}/chapters/:chapterId/move`, guarded, async (request, reply) => {
    needRight(request, 'structure');
    const parsed = MoveBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, chapterId } = request.params as P;
    return mutateManuscript(app, request, async (tx) => {
      const row = await chapterOf(tx, bookId, chapterId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      await writeChapterOrder(tx, placeAt(await liveChapterIds(tx, bookId), row.id, parsed.data.position));
    });
  });

  app.delete(`${base}/chapters/:chapterId`, guarded, async (request, reply) => {
    needRight(request, 'structure');
    const parsed = DeleteBody.safeParse(request.body ?? undefined);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, chapterId } = request.params as P;
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const row = await chapterOf(tx, bookId, chapterId);
      if (row.deletedAt) return;
      const inside = await tx.select().from(blocks).where(and(eq(blocks.chapterId, row.id), isNull(blocks.deletedAt)));
      for (const b of inside) assertNotLockedByOther(b, userId);
      await tx.update(chapters).set({ deletedAt: new Date(), deleteComment: parsed.data?.comment || null }).where(eq(chapters.id, row.id));
      await writeChapterOrder(tx, await liveChapterIds(tx, bookId));
    });
  });

  app.post(`${base}/chapters/:chapterId/restore`, guarded, async (request) => {
    needRight(request, 'structure');
    const { bookId, chapterId } = request.params as P;
    return mutateManuscript(app, request, async (tx) => {
      const row = await chapterOf(tx, bookId, chapterId);
      if (!row.deletedAt) return;
      const order = await liveChapterIds(tx, bookId);
      await tx.update(chapters).set({ deletedAt: null, deleteComment: null, position: order.length }).where(eq(chapters.id, row.id));
    });
  });

  // ---- blocks ----

  app.post(`${base}/blocks`, guarded, async (request, reply) => {
    needRight(request, 'structure');
    const parsed = BlockCreateBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId } = request.params as P;
    const d = parsed.data;
    const res = await mutateManuscript(app, request, async (tx) => {
      const chapter = await chapterOf(tx, bookId, d.chapterId);
      if (chapter.deletedAt) throw new HttpError(404, 'not_found');
      await insertBlock(tx, { bookId, chapterId: chapter.id, title: d.title, synopsis: d.synopsis ?? '', text: '', position: d.position }, request.user!.id);
    });
    return reply.code(201).send(res);
  });

  /** Content change: needs the edit right, no foreign lock and the current version as base (FR-007, FR-004). */
  app.patch(`${base}/blocks/:blockId`, guarded, async (request, reply) => {
    needRight(request, 'edit');
    const parsed = BlockPatchBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, blockId } = request.params as P;
    const d = parsed.data;
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      assertNotLockedByOther(row, userId);
      if (row.version !== d.baseVersion) throw new HttpError(409, 'conflict');
      const next = { title: d.title ?? row.title, synopsis: d.synopsis ?? row.synopsis, text: d.text ?? row.text };
      if (next.title === row.title && next.synopsis === row.synopsis && next.text === row.text) return;
      await writeVersion(tx, row, next, 'edit', userId);
    });
  });

  app.post(`${base}/blocks/:blockId/move`, guarded, async (request, reply) => {
    needRight(request, 'structure');
    const parsed = MoveBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, blockId } = request.params as P;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      assertNotLockedByOther(row, request.user!.id);
      const targetId = parsed.data.chapterId ?? row.chapterId;
      const target = await chapterOf(tx, bookId, targetId);
      if (target.deletedAt) throw new HttpError(404, 'not_found');
      if (target.id !== row.chapterId) {
        await writeBlockOrder(tx, row.chapterId, (await liveBlockIds(tx, row.chapterId)).filter((id) => id !== row.id));
      }
      await writeBlockOrder(tx, target.id, placeAt(await liveBlockIds(tx, target.id), row.id, parsed.data.position));
    });
  });

  /** Soft delete with an optional comment (FR-002, FR-021). */
  app.delete(`${base}/blocks/:blockId`, guarded, async (request, reply) => {
    needRight(request, 'delete');
    const parsed = DeleteBody.safeParse(request.body ?? undefined);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, blockId } = request.params as P;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) return;
      assertNotLockedByOther(row, request.user!.id);
      await tx
        .update(blocks)
        .set({ deletedAt: new Date(), deleteComment: parsed.data?.comment || null, lockedBy: null, lockedAt: null })
        .where(eq(blocks.id, row.id));
      await writeBlockOrder(tx, row.chapterId, await liveBlockIds(tx, row.chapterId));
    });
  });

  /** Restores a soft-deleted block at the end of its chapter (FR-025). */
  app.post(`${base}/blocks/:blockId/restore`, guarded, async (request) => {
    needRight(request, 'delete');
    const { bookId, blockId } = request.params as P;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (!row.deletedAt) return;
      const chapter = await chapterOf(tx, bookId, row.chapterId);
      if (chapter.deletedAt) throw new HttpError(409, 'chapter_deleted');
      const order = await liveBlockIds(tx, row.chapterId);
      await tx.update(blocks).set({ deletedAt: null, deleteComment: null, position: order.length }).where(eq(blocks.id, row.id));
    });
  });

  // ---- versions (FR-004) ----

  app.get(`${base}/blocks/:blockId/versions`, guarded, async (request): Promise<BlockVersion[]> => {
    const { bookId, blockId } = request.params as P;
    const row = await blockOf(app.db, bookId, blockId);
    const rows = await app.db
      .select({
        version: blockVersions.version,
        title: blockVersions.title,
        synopsis: blockVersions.synopsis,
        text: blockVersions.text,
        reason: blockVersions.reason,
        createdAt: blockVersions.createdAt,
        authorName: users.displayName,
      })
      .from(blockVersions)
      .leftJoin(users, eq(users.id, blockVersions.authorId))
      .where(eq(blockVersions.blockId, row.id))
      .orderBy(desc(blockVersions.version));
    return rows.map((r) => ({
      ...r,
      reason: r.reason as BlockVersion['reason'],
      authorName: r.authorName ?? 'Unbekannt',
      createdAt: r.createdAt.toISOString(),
    }));
  });

  /** Brings back an older version as the newest one; nothing is lost. */
  app.post(`${base}/blocks/:blockId/versions/:version/restore`, guarded, async (request) => {
    needRight(request, 'edit');
    const { bookId, blockId, version } = request.params as P;
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      assertNotLockedByOther(row, userId);
      const [old] = await tx
        .select()
        .from(blockVersions)
        .where(and(eq(blockVersions.blockId, row.id), eq(blockVersions.version, Number.parseInt(version, 10) || 0)))
        .orderBy(asc(blockVersions.version));
      if (!old) throw new HttpError(404, 'not_found');
      await writeVersion(tx, row, old, 'restore', userId);
    });
  });

  // ---- locks (FR-007..FR-011) ----

  /** Takes the lock for editing; a foreign lock that has not run out is 423. Re-taking an own lock does not extend it (EC-001). */
  app.post(`${base}/blocks/:blockId/lock`, guarded, async (request) => {
    needRight(request, 'edit');
    const { bookId, blockId } = request.params as P;
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (row.deletedAt) throw new HttpError(404, 'not_found');
      assertNotLockedByOther(row, userId);
      const ownActive = row.lockedBy === userId && row.lockedAt !== null && lockActive(row.lockedAt);
      if (!ownActive) await tx.update(blocks).set({ lockedBy: userId, lockedAt: new Date() }).where(eq(blocks.id, row.id));
    });
  });

  /** Releases the caller's own lock; the author may release anyone's lock at any time (FR-010). */
  app.delete(`${base}/blocks/:blockId/lock`, guarded, async (request) => {
    const { bookId, blockId } = request.params as P;
    const userId = request.user!.id;
    return mutateManuscript(app, request, async (tx) => {
      const row = await blockOf(tx, bookId, blockId);
      if (lockedByOther(row, userId)) needAuthor(request);
      await tx.update(blocks).set({ lockedBy: null, lockedAt: null }).where(eq(blocks.id, row.id));
    });
  });
}
