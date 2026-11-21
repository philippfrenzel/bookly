/** Tests for the length choice and word range contracts. */
import { describe, expect, test } from 'vitest';
import { LENGTH_LABELS, LengthChoiceSchema, WORD_RANGE_MAX, WordRangeSchema } from './length.js';

describe('length contracts', () => {
  test('length choice accepts the three values and has German labels', () => {
    expect(LengthChoiceSchema.safeParse('book').success).toBe(true);
    expect(LengthChoiceSchema.safeParse('huge').success).toBe(false);
    expect(LENGTH_LABELS).toEqual({ short: 'knapp', book: 'passend zum Buch', long: 'ausführlich' });
  });

  test('word range needs positive integers within bounds and min <= max', () => {
    expect(WordRangeSchema.safeParse({ min: 50000, max: 80000 }).success).toBe(true);
    expect(WordRangeSchema.safeParse({ min: 5, max: 5 }).success).toBe(true);
    expect(WordRangeSchema.safeParse({ min: 10, max: 5 }).success).toBe(false);
    expect(WordRangeSchema.safeParse({ min: 0, max: 5 }).success).toBe(false);
    expect(WordRangeSchema.safeParse({ min: 1, max: WORD_RANGE_MAX + 1 }).success).toBe(false);
    expect(WordRangeSchema.safeParse({ min: 1, max: WORD_RANGE_MAX }).success).toBe(true);
    expect(WordRangeSchema.safeParse({ min: 1.5, max: 5 }).success).toBe(false);
  });
});
