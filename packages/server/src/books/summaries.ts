/** Book list summaries: counts, last change and a small line preview per book of one user. */
import { asc, count, eq, inArray } from 'drizzle-orm';
import type { BookLinePreview, BookSummary, Id, StorylineKind } from '@bookly/shared';
import type { Db } from '../db/client.js';
import { books, characters, storylines, timePoints } from '../db/schema.js';

/** Most storylines drawn in one card preview; the rest still count in `storylineCount`. */
export const MAX_PREVIEW_LINES = 6;

/**
 * Loads the book list of `userId`, oldest book first. Line previews list main lines first, then by
 * start; each spans the storyline's start and end time point as fractions of the book's ordered
 * time points (0 = first, 1 = last).
 */
export async function bookSummaries(db: Db, userId: Id): Promise<BookSummary[]> {
  const rows = await db
    .select({ id: books.id, title: books.title, updatedAt: books.updatedAt })
    .from(books)
    .where(eq(books.userId, userId))
    .orderBy(asc(books.createdAt), asc(books.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [points, lines, chars] = await Promise.all([
    db
      .select({ bookId: timePoints.bookId, id: timePoints.id, position: timePoints.position })
      .from(timePoints)
      .where(inArray(timePoints.bookId, ids))
      .orderBy(asc(timePoints.position)),
    db
      .select({
        bookId: storylines.bookId,
        color: storylines.color,
        kind: storylines.kind,
        startId: storylines.startId,
        endId: storylines.endId,
      })
      .from(storylines)
      .where(inArray(storylines.bookId, ids)),
    db
      .select({ bookId: characters.bookId, n: count(characters.id) })
      .from(characters)
      .where(inArray(characters.bookId, ids))
      .groupBy(characters.bookId),
  ]);

  // Index of each time point within its book's ordered axis, plus the axis length per book.
  const indexOf = new Map<Id, number>();
  const axisLength = new Map<Id, number>();
  for (const p of points) {
    const i = axisLength.get(p.bookId) ?? 0;
    indexOf.set(p.id, i);
    axisLength.set(p.bookId, i + 1);
  }
  const fraction = (bookId: Id, pointId: Id): number => {
    const n = axisLength.get(bookId) ?? 1;
    return n <= 1 ? 0 : (indexOf.get(pointId) ?? 0) / (n - 1);
  };

  const linesByBook = new Map<Id, BookLinePreview[]>();
  const storylineCount = new Map<Id, number>();
  for (const l of lines) {
    storylineCount.set(l.bookId, (storylineCount.get(l.bookId) ?? 0) + 1);
    const list = linesByBook.get(l.bookId) ?? [];
    const a = fraction(l.bookId, l.startId);
    const b = fraction(l.bookId, l.endId);
    const single = (axisLength.get(l.bookId) ?? 1) <= 1;
    list.push({
      color: l.color,
      kind: l.kind as StorylineKind,
      start: single ? 0 : Math.min(a, b),
      end: single ? 1 : Math.max(a, b),
    });
    linesByBook.set(l.bookId, list);
  }
  // Main lines on top, then in story order; only the first few are drawn.
  for (const [bookId, list] of linesByBook) {
    list.sort((x, y) => Number(y.kind === 'main') - Number(x.kind === 'main') || x.start - y.start || x.end - y.end);
    linesByBook.set(bookId, list.slice(0, MAX_PREVIEW_LINES));
  }
  const characterCount = new Map(chars.map((c) => [c.bookId, Number(c.n)]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    storylineCount: storylineCount.get(r.id) ?? 0,
    characterCount: characterCount.get(r.id) ?? 0,
    updatedAt: r.updatedAt.toISOString(),
    lines: linesByBook.get(r.id) ?? [],
  }));
}
