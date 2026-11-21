/** Access to a book's manuscript: the author (owner) has every right, a reviewer (Lektor) the rights granted to them. */
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { REVIEWER_RIGHTS, UUID_RE, normalizeRights } from '@bookly/shared';
import type { Id, ManuscriptResponse, ReviewerRight } from '@bookly/shared';
import type { Tx } from '../db/loadBook.js';
import { bookReviewers, books } from '../db/schema.js';
import { loadManuscript } from './load.js';

/** The caller's role and rights on the book of the current request. */
export interface WorkAccess {
  role: 'author' | 'reviewer';
  rights: ReviewerRight[];
}

declare module 'fastify' {
  interface FastifyRequest {
    work?: WorkAccess;
  }
}

/** An expected failure with an HTTP status; the app error handler answers `{ error: code }`. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    code: string,
  ) {
    super(code);
  }
}

/** preHandler (after requireUser): sets request.work for the author or a reviewer of :bookId, else 404. */
export async function workGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { bookId } = request.params as { bookId?: string };
  if (!bookId || !UUID_RE.test(bookId) || !request.user) {
    await reply.code(404).send({ error: 'not_found' });
    return;
  }
  const db = request.server.db;
  const [book] = await db.select({ userId: books.userId }).from(books).where(eq(books.id, bookId));
  if (book && book.userId === request.user.id) {
    request.work = { role: 'author', rights: [...REVIEWER_RIGHTS] };
    return;
  }
  const [rev] = book
    ? await db
        .select({ rights: bookReviewers.rights })
        .from(bookReviewers)
        .where(and(eq(bookReviewers.bookId, bookId), eq(bookReviewers.userId, request.user.id)))
    : [];
  if (!rev) {
    await reply.code(404).send({ error: 'not_found' });
    return;
  }
  request.work = { role: 'reviewer', rights: normalizeRights(rev.rights) };
}

/** Throws 403 unless the caller has `right` (FR-022). */
export function needRight(request: FastifyRequest, right: ReviewerRight): void {
  if (!request.work?.rights.includes(right)) throw new HttpError(403, 'forbidden');
}

/** Throws 403 unless the caller is the author. */
export function needAuthor(request: FastifyRequest): void {
  if (request.work?.role !== 'author') throw new HttpError(403, 'forbidden');
}

/**
 * Runs `change` in a transaction that first locks the book row, so manuscript changes of one book are serialized,
 * then answers with the fresh manuscript for the caller.
 */
export async function mutateManuscript(
  app: FastifyInstance,
  request: FastifyRequest,
  change: (tx: Tx) => Promise<void>,
): Promise<ManuscriptResponse> {
  const { bookId } = request.params as { bookId: Id };
  await app.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM books WHERE id = ${bookId} FOR UPDATE`);
    await change(tx);
  });
  return manuscriptFor(app, request);
}

/** The manuscript of the request's book as the caller sees it. */
export function manuscriptFor(app: FastifyInstance, request: FastifyRequest): Promise<ManuscriptResponse> {
  const { bookId } = request.params as { bookId: Id };
  return loadManuscript(app.db, bookId, request.user!.id, request.work!, app.ai !== null);
}
