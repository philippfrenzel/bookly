/** Tests for the character criteria catalogue and label helper. */
import { describe, expect, it } from 'vitest';
import { CHARACTER_CRITERIA, characterLabel } from './criteria.js';

describe('CHARACTER_CRITERIA', () => {
  it('lists the three AI criteria in order', () =>
    expect(CHARACTER_CRITERIA.map((c) => c.key)).toEqual(['behavior_change', 'intention_conflict', 'relationship_conflict']));
  it('gives every entry a label and description', () => {
    for (const c of CHARACTER_CRITERIA) {
      expect(c.label).not.toBe('');
      expect(c.description).not.toBe('');
    }
  });
});

describe('characterLabel', () => {
  it('falls back for unnamed characters', () => expect(characterLabel({ name: null })).toBe('Unbenannte Figur'));
  it('falls back for undefined', () => expect(characterLabel(undefined)).toBe('Unbenannte Figur'));
  it('returns the name', () => expect(characterLabel({ name: 'Anna' })).toBe('Anna'));
});
