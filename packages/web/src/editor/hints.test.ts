/** Tests for the reviewer hints: filler words, repeated nouns, sentence bounds. */
import { describe, expect, it } from 'vitest';
import { findHints, sentenceAt } from './hints';

const words = (text: string, names?: string[]) => findHints(text, names).map((h) => [h.kind, text.slice(h.from, h.to)]);

describe('findHints', () => {
  it('flags filler words in any case', () => {
    expect(words('Eigentlich wollte sie gehen. Dann kam plötzlich Regen.')).toEqual([
      ['filler', 'Eigentlich'],
      ['filler', 'plötzlich'],
    ]);
  });

  it('flags a noun repeated shortly after, but not sentence starts, short words or names', () => {
    expect(words('Sie sah den Hafen. Am Hafen lag ein Boot.')).toEqual([['repeat', 'Hafen']]);
    expect(words('Dann ging sie. Dann kam er.')).toEqual([]);
    expect(words('Lena sah Lena an, und Lena lachte.', ['Lena'])).toEqual([]);
  });

  it('forgets a noun once it is far enough back', () => {
    const filler = Array.from({ length: 30 }, () => 'und').join(' ');
    expect(words(`Sie sah den Hafen ${filler} den Hafen.`)).toEqual([]);
  });
});

describe('sentenceAt', () => {
  it('finds the sentence around a position, end punctuation included', () => {
    const text = 'Erster Satz. Zweiter Satz! Dritter';
    expect(text.slice(...Object.values(sentenceAt(text, 15)) as [number, number])).toBe('Zweiter Satz!');
    expect(text.slice(...Object.values(sentenceAt(text, 30)) as [number, number])).toBe('Dritter');
  });
});
