/** Helpers for validating storyline and section drafts locally before they are sent. */
import { validateBook, type Book, type Storyline, type ValidationIssue } from '@bookly/shared';

/** Validates the book as it would look with `storyline` added or replaced (matched by id). */
export function validateWithStoryline(book: Book, storyline: Storyline): ValidationIssue[] {
  const others = book.storylines.filter((s) => s.id !== storyline.id);
  return validateBook({ ...book, storylines: [...others, storyline] });
}

/** Trimmed note, or null when empty (the API stores an absent note as null). */
export function noteOrNull(note: string): string | null {
  const trimmed = note.trim();
  return trimmed === '' ? null : trimmed;
}
