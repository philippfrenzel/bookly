/** Assembles the BookResponse (book, hints, AI warnings, check states, scenes) returned by every book endpoint. */
import { asc, inArray } from 'drizzle-orm';
import { checkBook } from '@bookly/shared';
import type { Book, BookResponse, CharacterCriterion, CheckStatus } from '@bookly/shared';
import type { Db } from './client.js';
import type { Tx } from './loadBook.js';
import { loadScenes } from './loadScenes.js';
import { characterChecks, characterWarningAcks, characterWarnings } from './schema.js';

/** Builds the response for an already loaded book; warnings carry `acknowledged` by (storyline, character, criterion). */
export async function bookResponse(db: Db | Tx, book: Book, aiEnabled: boolean): Promise<BookResponse> {
  const lineIds = book.storylines.map((s) => s.id);
  const [checks, warnings, acks] = lineIds.length
    ? await Promise.all([
        db.select().from(characterChecks).where(inArray(characterChecks.storylineId, lineIds))
          .orderBy(asc(characterChecks.storylineId)),
        db.select().from(characterWarnings).where(inArray(characterWarnings.storylineId, lineIds))
          .orderBy(asc(characterWarnings.createdAt), asc(characterWarnings.id)),
        db.select().from(characterWarningAcks).where(inArray(characterWarningAcks.storylineId, lineIds)),
      ])
    : [[], [], []];
  const sceneData = await loadScenes(db, book.id);
  const ackKeys = new Set(acks.map((a) => `${a.storylineId}:${a.characterId}:${a.criterion}`));
  return {
    book,
    hints: checkBook(book),
    characterWarnings: warnings.map((w) => ({
      id: w.id,
      storylineId: w.storylineId,
      characterId: w.characterId,
      criterion: w.criterion as CharacterCriterion,
      message: w.message,
      acknowledged: ackKeys.has(`${w.storylineId}:${w.characterId}:${w.criterion}`),
    })),
    characterChecks: checks.map((c) => ({
      storylineId: c.storylineId,
      status: c.status as CheckStatus,
      finishedAt: c.finishedAt ? c.finishedAt.toISOString() : null,
      error: c.error,
    })),
    ...sceneData,
    ai: { enabled: aiEnabled },
  };
}
