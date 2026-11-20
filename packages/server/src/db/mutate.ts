/** Transactional mutation pipeline: change, reload, validate, prune stale acknowledgements, hint. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { staleAcknowledgements, validateBook } from '@bookly/shared';
import type { BookResponse, Id } from '@bookly/shared';
import { ValidationError } from '../errors.js';
import type { Db } from './client.js';
import { bookResponse } from './bookResponse.js';
import { loadBook, type Tx } from './loadBook.js';
import { acknowledgements } from './schema.js';

/**
 * Runs `change` in a transaction, reloads the aggregate and validates it. Any validation issue
 * throws ValidationError, rolling everything back. Stale acknowledgements are deleted.
 * The book row is locked first so concurrent mutations of one book are serialized.
 */
export async function mutateBook(db: Db, bookId: Id, change: (tx: Tx) => Promise<void>): Promise<BookResponse> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM books WHERE id = ${bookId} FOR UPDATE`);
    await change(tx);
    let book = await loadBook(tx, bookId);
    const issues = validateBook(book);
    if (issues.length > 0) throw new ValidationError(issues);
    const stale = staleAcknowledgements(book);
    if (stale.length > 0) {
      for (const a of stale) {
        await tx
          .delete(acknowledgements)
          .where(
            and(
              eq(acknowledgements.connectionId, a.connectionId),
              eq(acknowledgements.rule, a.rule),
              a.characterId === null
                ? isNull(acknowledgements.characterId)
                : eq(acknowledgements.characterId, a.characterId),
            ),
          );
      }
      book = await loadBook(tx, bookId);
    }
    // Task 7 passes the real AI flag; until then AI is reported off.
    return bookResponse(tx, book, false);
  });
}
