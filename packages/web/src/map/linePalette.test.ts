/** Tests for picking a distinct colour for a new line. */
import { describe, expect, it } from 'vitest';
import { sampleBook } from '../book/testFixtures';
import { LINE_PALETTE, nextLineColor } from './linePalette';

describe('nextLineColor', () => {
  it('skips colours already used in the book', () => {
    const book = sampleBook(); // its one main line uses the first main colour
    expect(nextLineColor(book, 'main')).toBe(LINE_PALETTE.main[1]!.hex);
    expect(nextLineColor(book, 'side')).toBe(LINE_PALETTE.side[0]!.hex);
  });

  it('cycles through the palette once every colour is taken', () => {
    const base = sampleBook();
    const proto = base.storylines[0]!;
    const storylines = LINE_PALETTE.main.map((c, i) => ({ ...proto, id: `s${i}`, color: c.hex }));
    expect(LINE_PALETTE.main.map((c) => c.hex)).toContain(nextLineColor({ ...base, storylines }, 'main'));
  });

  it('never offers signal red', () => {
    const all = [...LINE_PALETTE.main, ...LINE_PALETTE.side].map((c) => c.hex.toUpperCase());
    expect(all).not.toContain('#E3000F');
  });
});
