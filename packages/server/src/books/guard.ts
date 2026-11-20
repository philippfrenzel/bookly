/** Ownership guard for /api/books/:bookId/* routes. */
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { books } from '../db/schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** preHandler (run after requireUser): replies 404 unless :bookId is a book of request.user. */
export function bookGuard() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { bookId } = request.params as { bookId?: string };
    if (!bookId || !UUID.test(bookId) || !request.user) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    const [row] = await request.server.db
      .select({ id: books.id })
      .from(books)
      .where(and(eq(books.id, bookId), eq(books.userId, request.user.id)));
    if (!row) await reply.code(404).send({ error: 'not_found' });
  };
}
