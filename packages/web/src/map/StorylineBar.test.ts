/** Tests for the pure note-wrapping helper of the storyline bar. */
import { describe, expect, it } from 'vitest';
import { clampTwoLines } from './StorylineBar';

describe('clampTwoLines', () => {
  it('keeps short text on one line', () => {
    expect(clampTwoLines('Kurz', 300)).toEqual(['Kurz']);
  });
  it('wraps onto two lines without loss when it fits', () => {
    const lines = clampTwoLines('eins zwei drei vier', 60);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.join(' ')).toBe('eins zwei drei vier');
  });
  it('never returns more than two lines and ellipsises the overflow', () => {
    const lines = clampTwoLines('wort '.repeat(60).trim(), 120);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });
  it('returns nothing for blank text', () => {
    expect(clampTwoLines('   ', 100)).toEqual([]);
  });
});
