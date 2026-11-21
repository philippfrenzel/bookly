/**
 * Style routes: the style of one work (author only; FR-015, FR-016) and the author's team base styles that every
 * work of theirs can use (FR-017).
 */
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { BookStyleBody, TeamStyleBody, UUID_RE } from '@bookly/shared';
import type { TeamStyle } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { bookStyles, teamStyles } from '../db/schema.js';
import { HttpError, mutateManuscript, needAuthor, workGuard } from './access.js';

/** Registers the style routes. */
export async function styleRoutes(app: FastifyInstance): Promise<void> {
  const invalid = (reply: FastifyReply, details: unknown) => reply.code(400).send({ error: 'invalid_body', details });

  app.put('/api/books/:bookId/manuscript/style', { preHandler: [requireUser, workGuard] }, async (request, reply) => {
    needAuthor(request);
    const parsed = BookStyleBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId } = request.params as { bookId: string };
    const d = parsed.data;
    return mutateManuscript(app, request, async (tx) => {
      const own = await tx.select({ id: teamStyles.id }).from(teamStyles).where(eq(teamStyles.ownerId, request.user!.id));
      const teamStyleIds = d.teamStyleIds.filter((id) => own.some((o) => o.id === id));
      await tx
        .insert(bookStyles)
        .values({ bookId, presetKeys: d.presetKeys, teamStyleIds, addition: d.addition })
        .onConflictDoUpdate({ target: bookStyles.bookId, set: { presetKeys: d.presetKeys, teamStyleIds, addition: d.addition } });
    });
  });

  app.get('/api/team-styles', { preHandler: requireUser }, async (request): Promise<TeamStyle[]> =>
    app.db.select({ id: teamStyles.id, name: teamStyles.name, description: teamStyles.description }).from(teamStyles)
      .where(eq(teamStyles.ownerId, request.user!.id)).orderBy(asc(teamStyles.name)));

  app.post('/api/team-styles', { preHandler: requireUser }, async (request, reply) => {
    const parsed = TeamStyleBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const [row] = await app.db.insert(teamStyles).values({ ownerId: request.user!.id, ...parsed.data })
      .returning({ id: teamStyles.id, name: teamStyles.name, description: teamStyles.description });
    return reply.code(201).send(row);
  });

  app.patch('/api/team-styles/:id', { preHandler: requireUser }, async (request, reply) => {
    const parsed = TeamStyleBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) throw new HttpError(404, 'not_found');
    const [row] = await app.db.update(teamStyles).set(parsed.data).where(and(eq(teamStyles.id, id), eq(teamStyles.ownerId, request.user!.id)))
      .returning({ id: teamStyles.id, name: teamStyles.name, description: teamStyles.description });
    if (!row) throw new HttpError(404, 'not_found');
    return row;
  });

  app.delete('/api/team-styles/:id', { preHandler: requireUser }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_RE.test(id)) throw new HttpError(404, 'not_found');
    await app.db.delete(teamStyles).where(and(eq(teamStyles.id, id), eq(teamStyles.ownerId, request.user!.id)));
    return reply.code(204).send();
  });
}
