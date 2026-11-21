/** Unit tests for the length guidance sentence of AI prompts (book word range and length choice). */
import { describe, expect, test } from 'vitest';
import { lengthGuidance } from './lengthGuidance.js';

const F = 'Etwa 300 bis 600 Wörter.';
const RANGE = { min: 60000, max: 90000 };

describe('lengthGuidance', () => {
  test('returns the fallback without range and with book length', () => {
    expect(lengthGuidance(null, 'book', F)).toBe(F);
    expect(lengthGuidance(undefined, undefined, F)).toBe(F);
  });

  test('short and long without range use fixed word spans', () => {
    expect(lengthGuidance(null, 'short', F)).toBe('Etwa 150 bis 300 Wörter.');
    expect(lengthGuidance(undefined, 'long', F)).toBe('Etwa 600 bis 1000 Wörter.');
  });

  test('with a range names the whole book, never a per-scene quota', () => {
    const text = lengthGuidance(RANGE, 'book', F);
    expect(text).toBe(
      'Das ganze Buch soll insgesamt etwa 60000–90000 Wörter umfassen. Das ist keine Vorgabe für diese Passage; wähle den Umfang so, wie der Inhalt es im Verhältnis zum ganzen Buch braucht.',
    );
    for (const length of ['short', 'book', 'long'] as const) {
      const t = lengthGuidance(RANGE, length, F);
      expect(t).toContain('60000–90000');
      expect(t).toContain('keine Vorgabe für diese Passage');
      expect(t).not.toContain('pro Szene');
    }
  });

  test('short and long with a range add a tendency', () => {
    expect(lengthGuidance(RANGE, 'short', F)).toMatch(/ Schreibe eher knapp\.$/);
    expect(lengthGuidance(RANGE, 'long', F)).toMatch(/ Schreibe eher ausführlich\.$/);
  });
});
