/** Scene routes: scenes, their notes and image, assignments to sections or storylines and the AI scene description. */
import { and, asc, eq, max } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  SCENE_IMAGE_MAX_BYTES,
  SCENE_IMAGE_TYPES,
  SceneAssignmentCreateBody,
  SceneAssignmentPatchBody,
  SceneBody,
  SceneDescriptionBody,
  SceneNoteBody,
  UUID_RE,
} from '@bookly/shared';
import type { Id, SceneDescriptionResult, SceneImageType } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { parseSceneDescription, sceneDescriptionRequest, selectNotes } from '../ai/scenePrompt.js';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import { books, sceneAssignmentBlocks, sceneAssignments, sceneImages, sceneNotes, scenes, sections, storylines } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { requireAi } from './aiRoutes.js';
import { assertInBook } from './childId.js';
import { bookGuard } from './guard.js';
import { assertAssignmentInBook, assertRevision, StaleRevision, writeBlocks } from './sceneBlocks.js';
import { assertSectionInBook } from './sections.js';

/** Thrown inside a mutation when the scene is already assigned to the section. */
class AlreadyAssigned extends Error {
  constructor() {
    super('already assigned');
  }
}

/** True when the leading bytes match the declared image type (no trust in the Content-Type alone). */
export function matchesImageType(mime: SceneImageType, data: Buffer): boolean {
  if (mime === 'image/jpeg') return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return data.length > 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP';
}

/** Throws NotFoundError unless `noteId` is a note of `sceneId`. */
async function assertNoteInScene(db: Db, noteId: string, sceneId: Id): Promise<void> {
  if (!UUID_RE.test(noteId)) throw new NotFoundError();
  const [row] = await db.select({ id: sceneNotes.id }).from(sceneNotes).where(and(eq(sceneNotes.id, noteId), eq(sceneNotes.sceneId, sceneId)));
  if (!row) throw new NotFoundError();
}

/** Registers the scene routes under /api/books/:bookId. */
export async function sceneRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const aiGuarded = { preHandler: [requireUser, bookGuard(), requireAi] };
  const base = '/api/books/:bookId';
  const invalid = (reply: FastifyReply, details: unknown) => reply.code(400).send({ error: 'invalid_body', details });

  // Raw image bodies for the upload route; the parser is scoped to this plugin.
  app.addContentTypeParser([...SCENE_IMAGE_TYPES], { parseAs: 'buffer', bodyLimit: SCENE_IMAGE_MAX_BYTES }, (_req, body, done) => done(null, body));

  app.post(`${base}/scenes`, guarded, async (request, reply) => {
    const parsed = SceneBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId } = request.params as { bookId: string };
    const result = await app.mutate(bookId, async (tx) => {
      await tx.insert(scenes).values({ bookId, name: parsed.data.name });
    });
    return reply.code(201).send(result);
  });

  app.patch(`${base}/scenes/:sceneId`, guarded, async (request, reply) => {
    const parsed = SceneBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, sceneId } = request.params as { bookId: string; sceneId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    return app.mutate(bookId, async (tx) => {
      await tx.update(scenes).set({ name: parsed.data.name }).where(eq(scenes.id, sceneId));
    });
  });

  app.delete(`${base}/scenes/:sceneId`, guarded, async (request) => {
    const { bookId, sceneId } = request.params as { bookId: string; sceneId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    // Notes, image and assignments go with the scene (foreign keys cascade).
    return app.mutate(bookId, async (tx) => {
      await tx.delete(scenes).where(eq(scenes.id, sceneId));
    });
  });

  app.post(`${base}/scenes/:sceneId/notes`, guarded, async (request, reply) => {
    const parsed = SceneNoteBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, sceneId } = request.params as { bookId: string; sceneId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    const result = await app.mutate(bookId, async (tx) => {
      const [row] = await tx.select({ last: max(sceneNotes.position) }).from(sceneNotes).where(eq(sceneNotes.sceneId, sceneId));
      await tx.insert(sceneNotes).values({ sceneId, text: parsed.data.text, position: (row?.last ?? -1) + 1 });
    });
    return reply.code(201).send(result);
  });

  app.patch(`${base}/scenes/:sceneId/notes/:noteId`, guarded, async (request, reply) => {
    const parsed = SceneNoteBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, sceneId, noteId } = request.params as { bookId: string; sceneId: string; noteId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    await assertNoteInScene(app.db, noteId, sceneId);
    return app.mutate(bookId, async (tx) => {
      await tx.update(sceneNotes).set({ text: parsed.data.text }).where(eq(sceneNotes.id, noteId));
    });
  });

  app.delete(`${base}/scenes/:sceneId/notes/:noteId`, guarded, async (request) => {
    const { bookId, sceneId, noteId } = request.params as { bookId: string; sceneId: string; noteId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    await assertNoteInScene(app.db, noteId, sceneId);
    return app.mutate(bookId, async (tx) => {
      await tx.delete(sceneNotes).where(eq(sceneNotes.id, noteId));
    });
  });

  app.put(`${base}/scenes/:sceneId/image`, { ...guarded, bodyLimit: SCENE_IMAGE_MAX_BYTES }, async (request, reply) => {
    const { bookId, sceneId } = request.params as { bookId: string; sceneId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    const mime = (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase() as SceneImageType;
    const data = request.body;
    if (!SCENE_IMAGE_TYPES.includes(mime) || !Buffer.isBuffer(data) || !matchesImageType(mime, data)) {
      return reply.code(415).send({ error: 'invalid_image' });
    }
    return app.mutate(bookId, async (tx) => {
      const row = { sceneId, mime, data, size: data.length, updatedAt: new Date() };
      await tx.insert(sceneImages).values(row).onConflictDoUpdate({ target: sceneImages.sceneId, set: { mime, data, size: data.length, updatedAt: row.updatedAt } });
    });
  });

  app.get(`${base}/scenes/:sceneId/image`, guarded, async (request, reply) => {
    const { bookId, sceneId } = request.params as { bookId: string; sceneId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    const [img] = await app.db.select().from(sceneImages).where(eq(sceneImages.sceneId, sceneId));
    if (!img) throw new NotFoundError();
    return reply
      .header('content-type', img.mime)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(img.data);
  });

  app.delete(`${base}/scenes/:sceneId/image`, guarded, async (request) => {
    const { bookId, sceneId } = request.params as { bookId: string; sceneId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    return app.mutate(bookId, async (tx) => {
      await tx.delete(sceneImages).where(eq(sceneImages.sceneId, sceneId));
    });
  });

  /** 404 unless the target (section or storyline) belongs to the book. */
  const assertTarget = async (t: { sectionId?: Id; storylineId?: Id }, bookId: Id) => {
    if (t.sectionId) await assertSectionInBook(app.db, t.sectionId, bookId);
    if (t.storylineId) await assertInBook(app.db, storylines, t.storylineId, bookId);
  };

  /** Throws AlreadyAssigned when the scene already sits at the target (other than in `except`). */
  const assertFree = async (tx: Tx, sceneId: Id, t: { sectionId?: Id; storylineId?: Id }, except?: Id) => {
    const at = t.sectionId ? eq(sceneAssignments.sectionId, t.sectionId) : eq(sceneAssignments.storylineId, t.storylineId!);
    const [dup] = await tx.select({ id: sceneAssignments.id }).from(sceneAssignments).where(and(eq(sceneAssignments.sceneId, sceneId), at));
    if (dup && dup.id !== except) throw new AlreadyAssigned();
  };

  app.post(`${base}/scene-assignments`, guarded, async (request, reply) => {
    const parsed = SceneAssignmentCreateBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    await assertInBook(app.db, scenes, d.sceneId, bookId);
    await assertTarget(d, bookId);
    try {
      // The book row is locked by mutate, so the check and the insert cannot interleave with another assignment.
      const result = await app.mutate(bookId, async (tx) => {
        await assertFree(tx, d.sceneId, d);
        const [row] = await tx
          .insert(sceneAssignments)
          .values({ sceneId: d.sceneId, sectionId: d.sectionId ?? null, storylineId: d.storylineId ?? null, description: d.description })
          .returning({ id: sceneAssignments.id });
        // A new assignment starts with one block holding its description.
        await tx.insert(sceneAssignmentBlocks).values({ assignmentId: row!.id, position: 0, text: d.description });
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof AlreadyAssigned) return reply.code(409).send({ error: 'already_assigned' });
      throw error;
    }
  });

  app.patch(`${base}/scene-assignments/:assignmentId`, guarded, async (request, reply) => {
    const parsed = SceneAssignmentPatchBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, assignmentId } = request.params as { bookId: string; assignmentId: string };
    await assertAssignmentInBook(app.db, assignmentId, bookId);
    const { description, sectionId, storylineId, revision } = parsed.data;
    const moving = sectionId !== undefined || storylineId !== undefined;
    if (moving) await assertTarget({ sectionId, storylineId }, bookId);
    try {
      // Moving (AC-003 „ändern“): the scene may sit at the target only once; the book row lock serialises the check.
      return await app.mutate(bookId, async (tx) => {
        if (moving) {
          const [current] = await tx.select({ sceneId: sceneAssignments.sceneId }).from(sceneAssignments).where(eq(sceneAssignments.id, assignmentId));
          await assertFree(tx, current!.sceneId, { sectionId, storylineId }, assignmentId);
        }
        if (moving) {
          await tx.update(sceneAssignments).set({ sectionId: sectionId ?? null, storylineId: storylineId ?? null }).where(eq(sceneAssignments.id, assignmentId));
        }
        // Replacing the description replaces all blocks by one (and dates it, FR-005); a pure move keeps blocks, revision and updatedAt.
        if (description !== undefined) {
          if (revision !== undefined) await assertRevision(tx, assignmentId, revision);
          await writeBlocks(tx, assignmentId, [{ text: description }]);
        }
      });
    } catch (error) {
      if (error instanceof AlreadyAssigned) return reply.code(409).send({ error: 'already_assigned' });
      if (error instanceof StaleRevision) return reply.code(409).send({ error: 'stale' });
      throw error;
    }
  });

  app.delete(`${base}/scene-assignments/:assignmentId`, guarded, async (request) => {
    const { bookId, assignmentId } = request.params as { bookId: string; assignmentId: string };
    await assertAssignmentInBook(app.db, assignmentId, bookId);
    return app.mutate(bookId, async (tx) => {
      await tx.delete(sceneAssignments).where(eq(sceneAssignments.id, assignmentId));
    });
  });

  app.post(`${base}/scenes/:sceneId/description`, aiGuarded, async (request, reply): Promise<SceneDescriptionResult | FastifyReply> => {
    const parsed = SceneDescriptionBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, sceneId } = request.params as { bookId: string; sceneId: string };
    await assertInBook(app.db, scenes, sceneId, bookId);
    const { sectionId, storylineId, kind } = parsed.data;
    if (sectionId) await assertSectionInBook(app.db, sectionId, bookId);
    if (storylineId) await assertInBook(app.db, storylines, storylineId, bookId);

    const [scene] = await app.db.select({ name: scenes.name, bookTitle: books.title }).from(scenes).innerJoin(books, eq(books.id, scenes.bookId)).where(eq(scenes.id, sceneId));
    const notes = await app.db.select({ text: sceneNotes.text }).from(sceneNotes).where(eq(sceneNotes.sceneId, sceneId)).orderBy(asc(sceneNotes.position));
    const [img] = await app.db.select({ mime: sceneImages.mime, data: sceneImages.data }).from(sceneImages).where(eq(sceneImages.sceneId, sceneId));
    const [section] = sectionId
      ? await app.db
          .select({ title: sections.title, description: sections.description, storylineTitle: storylines.title })
          .from(sections)
          .innerJoin(storylines, eq(storylines.id, sections.storylineId))
          .where(eq(sections.id, sectionId))
      : [];
    const [line] = storylineId
      ? await app.db.select({ title: storylines.title, description: storylines.description, kind: storylines.kind }).from(storylines).where(eq(storylines.id, storylineId))
      : [];
    const selection = selectNotes(notes.map((n) => n.text));
    if (selection.notes.length === 0 && !img) return reply.code(400).send({ error: 'empty_context' });

    // AC-004 / AC-008: which context reached the model is traceable in the log; contents are not logged.
    request.log.info(
      {
        sceneId,
        sectionId,
        storylineId,
        kind,
        notesSent: selection.notes.length,
        noteChars: selection.chars,
        notesOmitted: selection.omitted,
        image: img ? { mime: img.mime, size: img.data.length } : null,
        model: app.ai!.model,
      },
      'scene description context',
    );
    try {
      const raw = await app.ai!.complete(
        sceneDescriptionRequest({
          bookTitle: scene!.bookTitle,
          sceneName: scene!.name,
          notes: selection.notes,
          image: img ? { mime: img.mime, data: img.data } : null,
          section: section ?? null,
          storyline: line ?? null,
          kind,
        }),
      );
      return { description: parseSceneDescription(raw) };
    } catch (err) {
      request.log.warn({ err, sceneId }, 'scene description failed');
      return reply.code(502).send({ error: 'ai_failed' });
    }
  });
}
