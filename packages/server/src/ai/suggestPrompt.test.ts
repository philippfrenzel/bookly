/** Unit tests for suggestion request building and response parsing. */
import { describe, expect, test } from 'vitest';
import { AiError } from './client.js';
import { parseSuggestion, suggestRequest } from './suggestPrompt.js';

const character = { name: 'Anna', description: 'Ärztin', behavior: '', intentions: '' };

describe('suggestRequest', () => {
  test('base profile request', () => {
    const req = suggestRequest({ character });
    expect(req.schemaName).toBe('character_suggestion');
    expect(req.timeoutMs).toBe(30_000);
    expect(req.user).toContain('Ärztin');
    const schema = req.schema as any;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(['behavior', 'intentions']);
  });
  test('with storyline the prompt contains its title and asks only for differences', () => {
    const req = suggestRequest({ character, storyline: { title: 'Die Flucht', description: 'd', note: '', sections: [{ title: 'Akt 1', description: 'sd' }] } });
    expect(req.user).toContain('Die Flucht');
    expect(req.system).toContain('nur');
  });
});

describe('parseSuggestion', () => {
  test('parses valid and throws on invalid', () => {
    expect(parseSuggestion({ behavior: 'a', intentions: 'b' })).toEqual({ behavior: 'a', intentions: 'b' });
    expect(() => parseSuggestion({ x: 1 })).toThrow(AiError);
  });

  test('trims each field and clamps it to 2000 characters', () => {
    const long = 'x'.repeat(2500);
    expect(parseSuggestion({ behavior: `  mutig \n`, intentions: long })).toEqual({ behavior: 'mutig', intentions: 'x'.repeat(2000) });
    expect(parseSuggestion({ behavior: '   ', intentions: '' })).toEqual({ behavior: '', intentions: '' });
  });
});
