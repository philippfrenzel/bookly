/** Book routes: list, create, read, rename / set the target word range, delete. */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { BookBody, BookPatchBody } from '@bookly/shared';
import type { BookResponse, BookSummary } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import { bookResponse } from '../db/bookResponse.js';
import { loadBook } from '../db/loadBook.js';
import { books } from '../db/schema.js';
import { bookSummaries } from './summaries.js';
import { bookGuard } from './guard.js';

/** Registers the /api/books routes. */
export async function bookRoutes(app: FastifyInstance): Promise<void> {
  const guarded = { preHandler: [requireUser, bookGuard()] };

  app.get('/api/books', { preHandler: requireUser }, async (request): Promise<BookSummary[]> => {
    return bookSummaries(app.db, request.user!.id);
  });

  app.post('/api/books', { preHandler: requireUser }, async (request, reply) => {
    const parsed = BookBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const [created] = await app.db
      .insert(books)
      .values({ userId: request.user!.id, title: parsed.data.title })
      .returning({ id: books.id });
    const book = await loadBook(app.db, created!.id);
    const body: BookResponse = await bookResponse(app.db, book, app.ai !== null);
    return reply.code(201).send(body);
  });

  app.get('/api/books/:bookId', guarded, async (request): Promise<BookResponse> => {
    const { bookId } = request.params as { bookId: string };
    // One consistent snapshot for the aggregate.
    return app.db.transaction(
      async (tx) => {
        const book = await loadBook(tx, bookId);
        return bookResponse(tx, book, app.ai !== null);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  });

  app.patch('/api/books/:bookId', guarded, async (request, reply) => {
    const parsed = BookPatchBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    const { bookId } = request.params as { bookId: string };
    const { title, targetWords } = parsed.data;
    // Only the given fields change; `targetWords: null` clears the range.
    return app.mutate(bookId, async (tx) => {
      await tx
        .update(books)
        .set({
          ...(title !== undefined ? { title } : {}),
          ...(targetWords !== undefined ? { targetWordsMin: targetWords?.min ?? null, targetWordsMax: targetWords?.max ?? null } : {}),
        })
        .where(eq(books.id, bookId));
    });
  });

  app.delete('/api/books/:bookId', guarded, async (request, reply) => {
    await app.db.delete(books).where(eq(books.id, (request.params as { bookId: string }).bookId));
    return reply.code(204).send();
  });
}
