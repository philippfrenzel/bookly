/** Tests for finding the characters a text names. */
import { describe, expect, it } from 'vitest';
import type { Character } from '@bookly/shared';
import { mentionedCharacters, withMentions } from './mentions.js';

const c = (name: string | null, description = ''): Character => ({ id: name ?? 'x', name, description, behavior: null, intentions: null });
const cast = [c('Lena', 'Hauptfigur'), c('Jakob', 'Bruder'), c('Frau Albrecht', 'Wärterin'), c(null), c('Al')];

describe('mentionedCharacters', () => {
  it('finds whole-word names in order of first mention, with or without @', () => {
    const found = mentionedCharacters(cast, 'Sie dachte an @Jakob. Dann sprach Frau Albrecht mit Lena.');
    expect(found.map((f) => f.name)).toEqual(['Jakob', 'Frau Albrecht', 'Lena']);
    expect(found[0]).toEqual({ name: 'Jakob', beschreibung: 'Bruder', verhalten: '', absichten: '' });
  });

  it('ignores names inside other words and names already in the context', () => {
    expect(mentionedCharacters(cast, 'Die Lenastraße und Albert.').map((f) => f.name)).toEqual([]);
    expect(mentionedCharacters(cast, 'Lena und Jakob.', ['Lena']).map((f) => f.name)).toEqual(['Jakob']);
  });
});

describe('withMentions', () => {
  it('adds erwaehnt for named characters not yet listed, and leaves the context alone otherwise', () => {
    const ctx = { fieldLabel: 'x', context: { figuren: [{ name: 'Lena', beschreibung: '' }] } };
    expect(withMentions(ctx, cast, 'Lena trifft Jakob.').context).toEqual({
      figuren: [{ name: 'Lena', beschreibung: '' }],
      erwaehnt: [{ name: 'Jakob', beschreibung: 'Bruder', verhalten: '', absichten: '' }],
    });
    expect(withMentions(ctx, cast, 'Nur Lena.')).toBe(ctx);
  });
});
