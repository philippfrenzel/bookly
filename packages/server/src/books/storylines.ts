/** Storyline routes: create, update (with main-to-side section conversion), delete. */
import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { KIND_DEFAULT_COLOR, StorylineCreateBody, StorylinePatchBody } from '@bookly/shared';
import type { Id } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import type { Tx } from '../db/loadBook.js';
import { mutateBook } from '../db/mutate.js';
import { sectionCharacters, sections, storylineCharacters, storylines, timePoints } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { assertInBook, assertKnownRefs } from './childId.js';
import { bookGuard } from './guard.js';

/** Replaces the character set of a storyline. */
async function setCharacters(tx: Tx, storylineId: Id, characterIds: Id[]): Promise<void> {
  await tx.delete(storylineCharacters).where(eq(storylineCharacters.storylineId, storylineId));
  const unique = [...new Set(characterIds)];
  if (unique.length > 0) {
    await tx.insert(storylineCharacters).values(unique.map((characterId) => ({ storylineId, characterId })));
  }
}

/**
 * Renders the storyline's sections as note blocks and deletes them. Returns the blocks joined by a
 * blank line, or null when there were no sections.
 */
async function sectionsToNote(tx: Tx, storylineId: Id, bookId: Id): Promise<string | null> {
  const rows = await tx.select().from(sections).where(eq(sections.storylineId, storylineId)).orderBy(asc(sections.order));
  if (rows.length === 0) return null;
  const names = new Map(
    (await tx.select({ id: timePoints.id, name: timePoints.name }).from(timePoints).where(eq(timePoints.bookId, bookId))).map(
      (t) => [t.id, t.name] as const,
    ),
  );
  const blocks = rows.map((s) => {
    const head = `Abschnitt: ${s.title} (${names.get(s.startId)} – ${names.get(s.endId)})`;
    return s.description === '' ? head : `${head}\n${s.description}`;
  });
  const ids = rows.map((s) => s.id);
  await tx.delete(sectionCharacters).where(inArray(sectionCharacters.sectionId, ids));
  await tx.delete(sections).where(eq(sections.storylineId, storylineId));
  return blocks.join('\n\n');
}

/** Registers the /api/books/:bookId/storylines routes. */
export async function storylineRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };
  const base = '/api/books/:bookId/storylines';

  app.post(base, guarded, async (request, reply) => {
    const parsed = StorylineCreateBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    const id = randomUUID();
    const result = await mutateBook(app.db, bookId, async (tx) => {
      await assertKnownRefs(tx, bookId, id, {
        timePointIds: [d.range.startId, d.range.endId],
        characterIds: d.characterIds,
      });
      await tx.insert(storylines).values({
        id,
        bookId,
        title: d.title,
        description: d.description,
        startId: d.range.startId,
        endId: d.range.endId,
        kind: d.kind,
        status: d.status,
        color: d.color ?? KIND_DEFAULT_COLOR[d.kind],
        note: d.note,
      });
      await setCharacters(tx, id, d.characterIds);
    });
    return reply.code(201).send(result);
  });

  app.patch(`${base}/:id`, guarded, async (request, reply) => {
    const parsed = StorylinePatchBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, storylines, id, bookId);
    const d = parsed.data;
    return mutateBook(app.db, bookId, async (tx) => {
      const [current] = await tx.select().from(storylines).where(eq(storylines.id, id));
      if (!current) throw new NotFoundError();
      await assertKnownRefs(tx, bookId, id, {
        timePointIds: d.range ? [d.range.startId, d.range.endId] : [],
        characterIds: d.characterIds ?? [],
      });
      const set: Partial<typeof storylines.$inferInsert> = {};
      if (d.title !== undefined) set.title = d.title;
      if (d.description !== undefined) set.description = d.description;
      if (d.range) {
        set.startId = d.range.startId;
        set.endId = d.range.endId;
      }
      if (d.status !== undefined) set.status = d.status;
      if (d.color !== undefined) set.color = d.color;
      if (d.note !== undefined) set.note = d.note;
      if (d.kind !== undefined && d.kind !== current.kind) {
        set.kind = d.kind;
        if (d.color === undefined && current.color === KIND_DEFAULT_COLOR[current.kind as 'main' | 'side']) {
          set.color = KIND_DEFAULT_COLOR[d.kind];
        }
        if (current.kind === 'main' && d.kind === 'side') {
          const moved = await sectionsToNote(tx, id, bookId);
          if (moved !== null) {
            const existing = d.note !== undefined ? d.note : current.note;
            set.note = existing ? `${existing}\n\n${moved}` : moved;
          }
        }
      }
      if (Object.keys(set).length > 0) await tx.update(storylines).set(set).where(eq(storylines.id, id));
      if (d.characterIds !== undefined) await setCharacters(tx, id, d.characterIds);
    });
  });

  app.delete(`${base}/:id`, guarded, async (request) => {
    const { bookId, id } = request.params as { bookId: string; id: string };
    await assertInBook(app.db, storylines, id, bookId);
    // Sections, character links and connections are removed by foreign key cascades.
    return mutateBook(app.db, bookId, async (tx) => {
      await tx.delete(storylines).where(eq(storylines.id, id));
    });
  });
}
