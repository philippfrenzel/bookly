/** Book routes: list, create, read, rename, delete. */
import { asc, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { BookBody } from '@bookly/shared';
import type { BookResponse } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { bookResponse } from '../db/bookResponse.js';
import { loadBook } from '../db/loadBook.js';
import { mutateBook } from '../db/mutate.js';
import { books, storylines } from '../db/schema.js';
import { bookGuard } from './guard.js';

/** Registers the /api/books routes. */
export async function bookRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };

  app.get('/api/books', { preHandler: requireUser }, async (request) => {
    const rows = await app.db
      .select({ id: books.id, title: books.title, storylineCount: count(storylines.id) })
      .from(books)
      .leftJoin(storylines, eq(storylines.bookId, books.id))
      .where(eq(books.userId, request.user!.id))
      .groupBy(books.id)
      .orderBy(asc(books.createdAt), asc(books.id));
    return rows.map((r) => ({ id: r.id, title: r.title, storylineCount: Number(r.storylineCount) }));
  });

  app.post('/api/books', { preHandler: requireUser }, async (request, reply) => {
    const parsed = BookBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const [created] = await app.db
      .insert(books)
      .values({ userId: request.user!.id, title: parsed.data.title })
      .returning({ id: books.id });
    const book = await loadBook(app.db, created!.id);
    const body: BookResponse = await bookResponse(app.db, book, false);
    return reply.code(201).send(body);
  });

  app.get('/api/books/:bookId', guarded, async (request): Promise<BookResponse> => {
    const { bookId } = request.params as { bookId: string };
    // One consistent snapshot for the aggregate.
    return app.db.transaction(
      async (tx) => {
        const book = await loadBook(tx, bookId);
        return bookResponse(tx, book, false);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  });

  app.patch('/api/books/:bookId', guarded, async (request, reply) => {
    const parsed = BookBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    return mutateBook(app.db, bookId, async (tx) => {
      await tx.update(books).set({ title: parsed.data.title }).where(eq(books.id, bookId));
    });
  });

  app.delete('/api/books/:bookId', guarded, async (request, reply) => {
    await app.db.delete(books).where(eq(books.id, (request.params as { bookId: string }).bookId));
    return reply.code(204).send();
  });
}
