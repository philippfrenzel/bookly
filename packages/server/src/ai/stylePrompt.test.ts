/** Unit tests for the style instruction and the shared prose-quality rules. */
import { describe, expect, test } from 'vitest';
import { NATURAL_PROSE, STYLE_VOICE, styleText } from './stylePrompt.js';

const TEAM = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const teamStyles = [
  { id: TEAM, name: 'Hausstil', description: 'Trocken und genau.' },
  { id: OTHER, name: 'Ungewählt', description: 'Nicht gewählt.' },
];

describe('styleText', () => {
  test('is empty without any style', () => {
    expect(styleText({ presetKeys: [], teamStyleIds: [], addition: '' }, teamStyles)).toBe('');
  });

  test('combines only picked presets and team styles plus the addition', () => {
    const text = styleText({ presetKeys: ['knapp'], teamStyleIds: [TEAM], addition: 'Viel Regen.' }, teamStyles);
    expect(text).toBe(
      ['Modern und knapp: Kurze Sätze, wenig Adjektive, viel Subtext, zügiges Tempo.', 'Hausstil: Trocken und genau.', 'Ergänzung des Autors: Viel Regen.'].join('\n'),
    );
    expect(text).not.toContain('Ungewählt');
    expect(text).not.toContain('Poetisch');
  });
});

describe('prompt rules', () => {
  test('NATURAL_PROSE asks for natural, concrete, varied prose without stock phrases', () => {
    for (const word of ['natürlich', 'Floskeln', 'Satzbau', 'Erfinde nichts', 'widerspricht']) expect(NATURAL_PROSE).toContain(word);
    expect(NATURAL_PROSE).not.toContain('Zahlen');
  });

  test('STYLE_VOICE applies the style as a voice, combines entries and lets the author win', () => {
    for (const word of ['Satzlänge', 'Rhythmus', 'Erzählabstand', 'Dialog', 'kombiniert', 'Ergänzung des Autors', '"anweisung"', 'Abwechslungsregeln']) {
      expect(STYLE_VOICE).toContain(word);
    }
  });
});
