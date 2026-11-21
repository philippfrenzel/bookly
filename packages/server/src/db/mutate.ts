/** Transactional mutation pipeline: change, reload, validate, prune stale acknowledgements. */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { staleAcknowledgements, validateBook } from '@bookly/shared';
import type { Book, Id } from '@bookly/shared';
import { ValidationError } from '../errors.js';
import type { Db } from './client.js';
import { loadBook, type Tx } from './loadBook.js';
import { acknowledgements, books } from './schema.js';

/**
 * Runs `change` in a transaction, reloads the aggregate and validates it. Any validation issue
 * throws ValidationError, rolling everything back. Stale acknowledgements are deleted and the
 * book's `updatedAt` is bumped.
 * The book row is locked first so concurrent mutations of one book are serialized. Resolves with the
 * committed book; `app.mutate` turns it into a BookResponse.
 */
export async function mutateBook(db: Db, bookId: Id, change: (tx: Tx) => Promise<void>): Promise<Book> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM books WHERE id = ${bookId} FOR UPDATE`);
    await change(tx);
    await tx.update(books).set({ updatedAt: sql`now()` }).where(eq(books.id, bookId));
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
    return book;
  });
}
