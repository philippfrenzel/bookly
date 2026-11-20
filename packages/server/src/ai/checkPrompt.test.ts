/** Unit tests for check input building, hashing, request schema and response parsing. */
import { describe, expect, test } from 'vitest';
import type { Book, Character, Storyline } from '@bookly/shared';
import { AiError } from './client.js';
import { buildCheckInput, checkRequest, inputHash, parseCheckResponse } from './checkPrompt.js';

const ch = (id: string, name: string | null): Character => ({ id, name, description: `d-${id}`, behavior: `b-${id}`, intentions: null });
const storyline = (over: Partial<Storyline> = {}): Storyline => ({
  id: 's1', title: 'Haupt', description: 'desc', characterIds: ['a'], range: { startId: 't1', endId: 't2' },
  kind: 'main', status: 'active', color: '#000', note: null, additions: [],
  sections: [{ id: 'x1', storylineId: 's1', title: 'Akt 1', description: 'sd', characterIds: ['b'], range: { startId: 't1', endId: 't2' }, note: 'sn', order: 0 }],
  ...over,
}) as Storyline;
const book = (s: Storyline, characters = [ch('a', 'Anna'), ch('b', 'Ben')]): Book =>
  ({ id: 'bk', title: 'B', timePoints: [], characters, storylines: [s], connections: [], acknowledgements: [] }) as Book;

describe('buildCheckInput', () => {
  test('includes section-only characters without addition, own characters first', () => {
    const s = storyline({ additions: [{ characterId: 'a', behavior: 'add', intentions: null }] });
    const input = buildCheckInput(book(s), 's1')!;
    expect(input.characters.map((c) => c.id)).toEqual(['a', 'b']);
    expect(input.characters[0]).toMatchObject({ label: 'Anna', addition: { behavior: 'add', intentions: '' } });
    expect(input.characters[1]!.addition).toBeNull();
    expect(input.sections[0]).toMatchObject({ title: 'Akt 1', note: 'sn', characterIds: ['b'] });
    expect(input.storyline.note).toBe('');
  });
  test('returns null without characters or for missing storyline', () => {
    const s = storyline({ characterIds: [], sections: [] });
    expect(buildCheckInput(book(s), 's1')).toBeNull();
    expect(buildCheckInput(book(s), 'nope')).toBeNull();
  });
  test('ignores unknown character ids and deduplicates', () => {
    const s = storyline({ characterIds: ['a', 'gone', 'b'] });
    expect(buildCheckInput(book(s), 's1')!.characters.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('inputHash', () => {
  test('is stable, and changes with additions and model', () => {
    const s = storyline();
    const a = buildCheckInput(book(s), 's1')!;
    const b = buildCheckInput(book(s), 's1')!;
    const c = buildCheckInput(book(storyline({ additions: [{ characterId: 'a', behavior: 'x', intentions: null }] })), 's1')!;
    expect(inputHash(a, 'm')).toBe(inputHash(b, 'm'));
    expect(inputHash(a, 'm')).toMatch(/^[0-9a-f]{64}$/);
    expect(inputHash(a, 'm')).not.toBe(inputHash(c, 'm'));
    expect(inputHash(a, 'm')).not.toBe(inputHash(a, 'm2'));
  });
});

describe('checkRequest', () => {
  test('user is the JSON input and schema is strict', () => {
    const input = buildCheckInput(book(storyline()), 's1')!;
    const req = checkRequest(input);
    expect(req.user).toBe(JSON.stringify(input));
    expect(req.schemaName).toBe('character_check');
    expect(req.timeoutMs).toBe(60_000);
    expect(req.system).toContain('Grundprofil + Ergänzung gilt');
    const items = (req.schema as any).properties.warnings.items;
    expect(items.additionalProperties).toBe(false);
    expect(items.required.sort()).toEqual(['characterId', 'criterion', 'message']);
    expect(items.properties.criterion.enum).toContain('behavior_change');
  });
  test('distinguishes unnamed characters by id', () => {
    const s = storyline({ characterIds: ['u1', 'u2'], sections: [] });
    const input = buildCheckInput(book(s, [ch('u1', null), ch('u2', null)]), 's1')!;
    expect(input.characters.map((c) => c.label)).toEqual(['Unbenannte Figur', 'Unbenannte Figur']);
    expect((checkRequest(input).schema as any).properties.warnings.items.properties.characterId.enum).toEqual(['u1', 'u2']);
  });
});

describe('parseCheckResponse', () => {
  const input = buildCheckInput(book(storyline()), 's1')!;
  test('drops unknown ids and criteria, trims and caps messages', () => {
    const raw = { warnings: [
      { characterId: 'a', criterion: 'behavior_change', message: `  ${'x'.repeat(1200)} ` },
      { characterId: 'zzz', criterion: 'behavior_change', message: 'm' },
      { characterId: 'a', criterion: 'other', message: 'm' },
    ] };
    const out = parseCheckResponse(raw, input);
    expect(out).toHaveLength(1);
    expect(out[0]!.message).toHaveLength(1000);
  });
  test('throws invalid_response on wrong shape', () => {
    expect(() => parseCheckResponse({ foo: 1 }, input)).toThrow(AiError);
    expect(() => parseCheckResponse({ foo: 1 }, input)).toThrow('invalid_response');
  });
});
