/** Postgres-backed queue of character checks: enqueueing and clearing check rows. */
import { eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Book, Id } from '@bookly/shared';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import { characterChecks, characterWarnings } from '../db/schema.js';
import { buildCheckInput, inputHash } from './checkPrompt.js';

/** Upserts a pending check with a fresh `requestedAt`; on conflict only where `when` holds. */
async function upsertPending(db: Db, storylineId: Id, when: SQL | undefined): Promise<void> {
  await db
    .insert(characterChecks)
    .values({ storylineId, status: 'pending', requestedAt: sql`now()` })
    .onConflictDoUpdate({
      target: characterChecks.storylineId,
      set: { status: 'pending', requestedAt: sql`now()` },
      setWhere: when,
    });
}

/**
 * Enqueues automatic checks for storylines whose input differs from the last attempted one.
 * A pending check always gets its `requestedAt` bumped, so rapid edits coalesce; running checks
 * are left alone (the worker re-compares after the run). Storylines without input lose their
 * check row and warnings.
 */
export async function enqueueChanged(db: Db, book: Book, model: string): Promise<void> {
  const empty: Id[] = [];
  for (const s of book.storylines) {
    const input = buildCheckInput(book, s.id);
    if (!input) {
      empty.push(s.id);
      continue;
    }
    const hash = inputHash(input, model);
    await upsertPending(db, s.id, or(
      eq(characterChecks.status, 'pending'),
      sql`${characterChecks.status} <> 'running' AND ${characterChecks.inputHash} IS DISTINCT FROM ${hash}`,
    ));
  }
  await clearChecks(db, empty);
}

/** Enqueues checks on request, even when nothing changed; running checks are left alone. */
export async function enqueueForced(db: Db, storylineIds: Id[]): Promise<void> {
  for (const id of storylineIds) await upsertPending(db, id, ne(characterChecks.status, 'running'));
}

/** Deletes the check rows and warnings of the given storylines. */
export async function clearChecks(db: Db | Tx, storylineIds: Id[]): Promise<void> {
  if (storylineIds.length === 0) return;
  // Row first: it waits for a worker holding the row lock, so the warnings delete then sees its result.
  await db.delete(characterChecks).where(inArray(characterChecks.storylineId, storylineIds));
  await db.delete(characterWarnings).where(inArray(characterWarnings.storylineId, storylineIds));
}
