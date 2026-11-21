/**
 * The length sentence of AI prose prompts: the book's target word range as orientation (never a per-passage
 * quota) plus the author's length choice (spec 2026-11-21-szenen-schreiben-design.md §5 "Prompt-Text Umfang").
 */
import type { LengthChoice, WordRange } from '@bookly/shared';

/** Fixed spans used without a book range for the explicit choices. */
const SPAN_WITHOUT_RANGE: Record<Exclude<LengthChoice, 'book'>, string> = {
  short: 'Etwa 150 bis 300 Wörter.',
  long: 'Etwa 600 bis 1000 Wörter.',
};

/** Tendency appended to the range sentence for the explicit choices. */
const TENDENCY: Record<LengthChoice, string> = {
  short: ' Schreibe eher knapp.',
  book: '',
  long: ' Schreibe eher ausführlich.',
};

/** The whole-book sentence shared by the length guidance and the structure prompt's `zielumfang`. */
export function bookTotalSentence(range: WordRange): string {
  return `Das ganze Buch soll insgesamt etwa ${range.min}–${range.max} Wörter umfassen.`;
}

/**
 * Returns the length instruction for a prompt. Without range and with `book` (or no choice) it is `fallback`
 * unchanged, so existing prompts stay byte-identical; without range, `short`/`long` give a fixed span; with a
 * range it names the whole book's word count and states that it is not a quota for this passage.
 */
export function lengthGuidance(range: WordRange | null | undefined, length: LengthChoice = 'book', fallback: string): string {
  if (!range) return length === 'book' ? fallback : SPAN_WITHOUT_RANGE[length];
  return (
    `${bookTotalSentence(range)} ` +
    'Das ist keine Vorgabe für diese Passage; wähle den Umfang so, wie der Inhalt es im Verhältnis zum ganzen Buch braucht.' +
    TENDENCY[length]
  );
}
