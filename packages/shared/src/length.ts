/** Length choice for AI drafts and the target word range of a book (spec 2026-11-21-szenen-schreiben-design.md). */
import { z } from 'zod';

/** How long an AI draft should be: tight, fitting the book's target, or detailed. */
export type LengthChoice = 'short' | 'book' | 'long';
export const LengthChoiceSchema = z.enum(['short', 'book', 'long']);

/** German labels of the length choices. */
export const LENGTH_LABELS: Record<LengthChoice, string> = {
  short: 'knapp',
  book: 'passend zum Buch',
  long: 'ausführlich',
};

/** Upper bound of a target word count. */
export const WORD_RANGE_MAX = 2_000_000;

/** Target length of a book in words. */
export interface WordRange { min: number; max: number }

const words = z.number().int().min(1).max(WORD_RANGE_MAX);
export const WordRangeSchema = z
  .object({ min: words, max: words })
  .refine((r) => r.min <= r.max, { message: 'min must not exceed max' });
