/** Tests for line signet numbering and signet ink contrast. */
import { orderIndex } from '@bookly/shared';
import { describe, expect, it } from 'vitest';
import { sampleBook } from '../book/testFixtures';
import { inkOn, lineSignets } from './signets';

describe('lineSignets', () => {
  it('numbers main and side lines separately in story order', () => {
    const base = sampleBook();
    const main = base.storylines[0]!;
    const book = {
      ...base,
      storylines: [
        { ...main, id: 's2', title: 'Später', range: { startId: 't2', endId: 't2' } },
        main,
        { ...main, id: 's3', title: 'Nebenstrang', kind: 'side' as const },
      ],
    };
    const signets = lineSignets(book.storylines, orderIndex(book.timePoints));
    const byTitle = Object.fromEntries(book.storylines.map((s) => [s.title, signets.get(s.id)]));
    expect(byTitle['Hauptstrang']).toBe('H1');
    expect(byTitle['Später']).toBe('H2');
    expect(byTitle['Nebenstrang']).toBe('N1');
  });
});

describe('inkOn', () => {
  it('uses white on dark line colours and black on light ones', () => {
    expect(inkOn('#2B59C3')).toBe('#FFFFFF');
    expect(inkOn('#F7A600')).toBe('#1A1A1A');
    expect(inkOn('#8A94A6')).toBe('#1A1A1A');
  });
});
