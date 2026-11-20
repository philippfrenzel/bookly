/** Helper that resolves a child entity id from a URL, scoped to its book. */
import { and, eq, inArray } from 'drizzle-orm';
import type { Id, ValidationIssue } from '@bookly/shared';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import { characters, storylines, timePoints } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws NotFoundError unless `id` is a well-formed uuid of a row in `table` belonging to `bookId`. */
export async function assertInBook(
  db: Db | Tx,
  table: typeof timePoints | typeof characters | typeof storylines,
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

/**
 * Throws ValidationError (unknown_time_point / unknown_character) for any referenced id that is not
 * in `bookId`, so a stray uuid becomes a 422 rather than a foreign key violation.
 */
export async function assertKnownRefs(
  tx: Tx,
  bookId: Id,
  elementId: Id,
  refs: { timePointIds?: Id[]; characterIds?: Id[] },
): Promise<void> {
  const issues: ValidationIssue[] = [];
  const tpIds = [...new Set(refs.timePointIds ?? [])];
  if (tpIds.length > 0) {
    const rows = await tx
      .select({ id: timePoints.id })
      .from(timePoints)
      .where(and(eq(timePoints.bookId, bookId), inArray(timePoints.id, tpIds)));
    if (rows.length !== tpIds.length) {
      issues.push({ code: 'unknown_time_point', elementId, message: 'Zeitpunkt existiert nicht.' });
    }
  }
  const charIds = [...new Set(refs.characterIds ?? [])];
  if (charIds.length > 0) {
    const rows = await tx
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.bookId, bookId), inArray(characters.id, charIds)));
    if (rows.length !== charIds.length) {
      issues.push({ code: 'unknown_character', elementId, message: 'Figur existiert nicht.' });
    }
  }
  if (issues.length > 0) throw new ValidationError(issues);
}
