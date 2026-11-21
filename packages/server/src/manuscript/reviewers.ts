/**
 * Reviewer (Lektor) management: the author invites registered accounts by e-mail with individual rights,
 * at most MAX_REVIEWERS per book (FR-005, FR-006, BR-001). Reviewers find shared books under /api/reviews.
 */
import { and, asc, count, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { MAX_REVIEWERS, ReviewerCreateBody, ReviewerPatchBody, UUID_RE, normalizeRights } from '@bookly/shared';
import type { ReviewedBook } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { bookReviewers, books, users } from '../db/schema.js';
import { HttpError, mutateManuscript, needAuthor, workGuard } from './access.js';

/** Registers reviewer routes. */
export async function reviewerRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, workGuard] };
  const base = '/api/books/:bookId/manuscript/reviewers';
  const invalid = (reply: FastifyReply, details: unknown) => reply.code(400).send({ error: 'invalid_body', details });

  app.post(base, guarded, async (request, reply) => {
    needAuthor(request);
    const parsed = ReviewerCreateBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId } = request.params as { bookId: string };
    const res = await mutateManuscript(app, request, async (tx) => {
      const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email));
      if (!user) throw new HttpError(404, 'user_not_found');
      if (user.id === request.user!.id) throw new HttpError(400, 'self');
      const [existing] = await tx
        .select({ userId: bookReviewers.userId })
        .from(bookReviewers)
        .where(and(eq(bookReviewers.bookId, bookId), eq(bookReviewers.userId, user.id)));
      if (existing) throw new HttpError(409, 'already_reviewer');
      const [{ n }] = (await tx.select({ n: count() }).from(bookReviewers).where(eq(bookReviewers.bookId, bookId))) as [{ n: number }];
      if (n >= MAX_REVIEWERS) throw new HttpError(409, 'too_many_reviewers');
      await tx.insert(bookReviewers).values({ bookId, userId: user.id, rights: normalizeRights(parsed.data.rights) });
    });
    return reply.code(201).send(res);
  });

  app.patch(`${base}/:userId`, guarded, async (request, reply) => {
    needAuthor(request);
    const parsed = ReviewerPatchBody.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const { bookId, userId } = request.params as { bookId: string; userId: string };
    if (!UUID_RE.test(userId)) throw new HttpError(404, 'not_found');
    return mutateManuscript(app, request, async (tx) => {
      const updated = await tx
        .update(bookReviewers)
        .set({ rights: normalizeRights(parsed.data.rights) })
        .where(and(eq(bookReviewers.bookId, bookId), eq(bookReviewers.userId, userId)))
        .returning({ userId: bookReviewers.userId });
      if (updated.length === 0) throw new HttpError(404, 'not_found');
    });
  });

  app.delete(`${base}/:userId`, guarded, async (request) => {
    needAuthor(request);
    const { bookId, userId } = request.params as { bookId: string; userId: string };
    if (!UUID_RE.test(userId)) throw new HttpError(404, 'not_found');
    return mutateManuscript(app, request, async (tx) => {
      await tx.delete(bookReviewers).where(and(eq(bookReviewers.bookId, bookId), eq(bookReviewers.userId, userId)));
    });
  });

  /** Books shared with the caller as reviewer. */
  app.get('/api/reviews', { preHandler: requireUser }, async (request): Promise<ReviewedBook[]> => {
    const rows = await app.db
      .select({ id: books.id, title: books.title, ownerName: users.displayName, rights: bookReviewers.rights })
      .from(bookReviewers)
      .innerJoin(books, eq(books.id, bookReviewers.bookId))
      .innerJoin(users, eq(users.id, books.userId))
      .where(eq(bookReviewers.userId, request.user!.id))
      .orderBy(asc(books.title));
    return rows.map((r) => ({ ...r, rights: normalizeRights(r.rights) }));
  });
}
