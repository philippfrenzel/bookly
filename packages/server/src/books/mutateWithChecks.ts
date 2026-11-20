/** The `app.mutate` decorator: book mutation followed by character check enqueueing and the full response. */
import type { FastifyInstance } from 'fastify';
import type { BookResponse, Id } from '@bookly/shared';
import { enqueueChanged } from '../ai/queue.js';
import { bookResponse } from '../db/bookResponse.js';
import type { Tx } from '../db/loadBook.js';
import { mutateBook } from '../db/mutate.js';

declare module 'fastify' {
  interface FastifyInstance {
    mutate(bookId: Id, change: (tx: Tx) => Promise<void>): Promise<BookResponse>;
  }
}

/**
 * Decorates `app.mutate`: runs `mutateBook`, then (after commit, AI on) enqueues checks whose input
 * changed, then builds the response so a fresh `pending` check shows up. An enqueue failure is logged
 * and never fails the save.
 */
export function decorateMutate(app: FastifyInstance): void {
  app.decorate('mutate', async (bookId: Id, change: (tx: Tx) => Promise<void>): Promise<BookResponse> => {
    const book = await mutateBook(app.db, bookId, change);
    if (app.ai) {
      try {
        await enqueueChanged(app.db, book, app.ai.model);
      } catch (err) {
        app.log.error({ err, bookId }, 'could not enqueue character checks');
      }
    }
    return bookResponse(app.db, book, app.ai !== null);
  });
}
