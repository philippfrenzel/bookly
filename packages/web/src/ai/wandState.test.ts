import { describe, expect, it } from 'vitest';
import type { AiTextTarget } from '@bookly/shared';
import { menuItems } from './wandState';

const id = '11111111-1111-4111-8111-111111111111';
const title: AiTextTarget = { kind: 'storyline', storylineId: id, field: 'title' };

describe('menuItems', () => {
  it('offers only Vorschlagen for an empty text', () => {
    const { items, hint } = menuItems({ text: '', selection: null, target: title, contextHasText: true });
    expect(items).toEqual([{ action: 'generate', label: 'Vorschlagen', disabled: false }]);
    expect(hint).toBeNull();
  });

  it('disables Vorschlagen without context on a storyline', () => {
    const { items, hint } = menuItems({ text: '', selection: null, target: title, contextHasText: false });
    expect(items[0]!.disabled).toBe(true);
    expect(hint).toBe('Erst Titel oder Beschreibung eingeben.');
  });

  it('uses the name hint for characters', () => {
    const target: AiTextTarget = { kind: 'character', characterId: id, field: 'description' };
    const { hint } = menuItems({ text: '', selection: null, target, contextHasText: false });
    expect(hint).toBe('Erst Name oder Beschreibung eingeben.');
  });

  it('disables everything for a too-short selection', () => {
    const { items, hint } = menuItems({ text: 'Mira ging weg', selection: { start: 0, end: 2 }, target: title, contextHasText: true });
    expect(items.map((i) => i.label)).toEqual(['Umformulieren', 'Fortsetzen', 'Stil verbessern', 'Eigene Anweisung …']);
    expect(items.every((i) => i.disabled)).toBe(true);
    expect(hint).toBe('Markierung zu kurz.');
  });

  it('disables Fortsetzen when little room is left', () => {
    const { items, hint } = menuItems({ text: 'a'.repeat(185), selection: null, target: title, contextHasText: true });
    const by = Object.fromEntries(items.map((i) => [i.action, i.disabled]));
    expect(by.continue).toBe(true);
    expect(by.rephrase).toBe(false);
    expect(by.polish).toBe(false);
    expect(hint).toBeNull();
  });
});
