/** Tests for the book list's relative time phrases. */
import { describe, expect, it } from 'vitest';
import { countLabel, editedAgo } from './relativeTime';

const now = new Date(2026, 10, 21, 9, 14);
const at = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

describe('editedAgo', () => {
  it('says „gerade eben“ within the first minute', () => {
    expect(editedAgo(at(2026, 10, 21, 9, 14), now)).toBe('gerade eben');
  });
  it('counts minutes within the hour', () => {
    expect(editedAgo(at(2026, 10, 21, 9, 13), now)).toBe('vor 1 Minute');
    expect(editedAgo(at(2026, 10, 21, 8, 30), now)).toBe('vor 44 Minuten');
  });
  it('names today and yesterday with the time', () => {
    expect(editedAgo(at(2026, 10, 21, 7, 5), now)).toBe('heute, 07:05');
    expect(editedAgo(at(2026, 10, 20, 21, 40), now)).toBe('gestern, 21:40');
  });
  it('counts days within a week, then shows the date', () => {
    expect(editedAgo(at(2026, 10, 17, 12, 0), now)).toBe('vor 4 Tagen');
    expect(editedAgo(at(2026, 9, 3, 12, 0), now)).toBe('am 3. Oktober');
    expect(editedAgo(at(2025, 9, 3, 12, 0), now)).toBe('am 3. Oktober 2025');
  });
});

describe('countLabel', () => {
  it('picks singular or plural', () => {
    expect(countLabel(1, 'Figur', 'Figuren')).toBe('1 Figur');
    expect(countLabel(0, 'Figur', 'Figuren')).toBe('0 Figuren');
  });
});
