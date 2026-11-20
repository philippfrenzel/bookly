/** Helper that resolves a child entity id from a URL, scoped to its book. */
import { and, eq } from 'drizzle-orm';
import type { Id } from '@bookly/shared';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import { characters, timePoints } from '../db/schema.js';
import { NotFoundError } from '../errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws NotFoundError unless `id` is a well-formed uuid of a row in `table` belonging to `bookId`. */
export async function assertInBook(
  db: Db | Tx,
  table: typeof timePoints | typeof characters,
  id: string | null | undefined,
  bookId: Id,
): Promise<void> {
  if (!id || !UUID.test(id)) throw new NotFoundError();
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.bookId, bookId)));
  if (!row) throw new NotFoundError();
}
