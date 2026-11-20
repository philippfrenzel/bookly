/**
 * Line colours of the network plan. Main lines draw from saturated colours, side lines from lighter
 * ones, so every line gets its own colour while main and side stay distinguishable by colour family
 * (and by weight and position). Signal red is never offered: it belongs to contradictions.
 */
import { KIND_DEFAULT_COLOR, type Book, type StorylineKind } from '@bookly/shared';

export interface LineColor { name: string; hex: string }

export const LINE_PALETTE: Record<StorylineKind, LineColor[]> = {
  main: [
    { name: 'Blau', hex: KIND_DEFAULT_COLOR.main },
    { name: 'Grün', hex: '#00A651' },
    { name: 'Violett', hex: '#9B3D97' },
    { name: 'Orange', hex: '#E07B00' },
    { name: 'Petrol', hex: '#00838F' },
    { name: 'Braun', hex: '#8D5524' },
  ],
  side: [
    { name: 'Hellblau', hex: '#5AA5DC' },
    { name: 'Hellgrün', hex: '#7CC48B' },
    { name: 'Sand', hex: '#E3B54A' },
    { name: 'Flieder', hex: '#B794C9' },
    { name: 'Lagune', hex: '#7DC4C9' },
    { name: 'Grau', hex: KIND_DEFAULT_COLOR.side },
  ],
};

/** First palette colour of the kind not yet used by a storyline of the book; cycles when all are taken. */
export function nextLineColor(book: Book, kind: StorylineKind): string {
  const used = new Set(book.storylines.map((s) => s.color.toLowerCase()));
  const palette = LINE_PALETTE[kind];
  const free = palette.find((c) => !used.has(c.hex.toLowerCase()));
  if (free) return free.hex;
  const count = book.storylines.filter((s) => s.kind === kind).length;
  return palette[count % palette.length]!.hex;
}
