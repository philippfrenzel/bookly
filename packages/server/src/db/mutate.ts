/** Transactional mutation pipeline: change, reload, validate, prune stale acknowledgements, hint. */
import { and, eq, isNull } from 'drizzle-orm';
import { checkBook, staleAcknowledgements, validateBook } from '@bookly/shared';
import type { Book, Hint, Id } from '@bookly/shared';
import { ValidationError } from '../errors.js';
import type { Db } from './client.js';
import { loadBook, type Tx } from './loadBook.js';
import { acknowledgements } from './schema.js';

/** Response shape of every book-returning endpoint. */
export interface BookResponse {
  book: Book;
  hints: Hint[];
}

/**
 * Runs `change` in a transaction, reloads the aggregate and validates it. Any validation issue
 * throws ValidationError, rolling everything back. Stale acknowledgements are deleted.
 */
export async function mutateBook(db: Db, bookId: Id, change: (tx: Tx) => Promise<void>): Promise<BookResponse> {
  return db.transaction(async (tx) => {
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
    return { book, hints: checkBook(book) };
  });
}
