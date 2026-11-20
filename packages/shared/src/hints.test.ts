import { describe, expect, test } from 'vitest';
import type { Acknowledgement, Book, Connection, Section, Storyline } from './domain.js';
import { checkBook, checkConnection, hintKey, staleAcknowledgements, strandCharacters } from './hints.js';

const tp = (i: number) => ({ id: `T${i}`, name: `Zeit ${i}`, position: i * 10 });
const r = (s: number, e: number) => ({ startId: `T${s}`, endId: `T${e}` });

function line(id: string, title: string, range: [number, number], characterIds: string[] = [], sections: Section[] = []): Storyline {
  return { id, title, description: '', characterIds, range: r(...range), kind: 'main', status: 'in_progress', color: '#2B59C3', note: null, additions: [], sections };
}

function conn(type: Connection['type'], characterId: string | null = null): Connection {
  return { id: 'k1', fromId: 'A', toId: 'B', type, label: null, characterId };
}

function mk(a: Storyline, b: Storyline, c: Connection, acknowledgements: Acknowledgement[] = []): Book {
  return {
    id: 'b1', title: 'Buch', timePoints: [0, 1, 2, 3, 4, 5].map(tp),
    characters: [
      { id: 'F1', name: 'Zora', description: null, behavior: null, intentions: null },
      { id: 'F2', name: 'Anna', description: null, behavior: null, intentions: null },
    ],
    storylines: [a, b], connections: [c], acknowledgements,
  };
}

const rules = (b: Book) => checkBook(b).map((h) => h.rule);
const A = (range: [number, number], chars: string[] = [], sections: Section[] = []) => line('A', 'Annas Flucht', range, chars, sections);
const B = (range: [number, number], chars: string[] = []) => line('B', 'Der Prozess', range, chars);
const sectionWith = (characterIds: string[]): Section => ({ id: 's', storylineId: 'A', title: 'x', description: '', characterIds, range: r(0, 1), note: null, order: 0 });

describe('time_jump_order', () => {
  test('hint when B does not start after A ends', () => expect(rules(mk(A([0, 2]), B([2, 4]), conn('time_jump')))).toEqual(['time_jump_order']));
  test('no hint when B starts after A ends', () => expect(rules(mk(A([0, 2]), B([3, 4]), conn('time_jump')))).toEqual([]));
});

describe('merge_no_contact', () => {
  test('hint when ranges do not touch', () => expect(rules(mk(A([0, 1]), B([3, 4]), conn('merge')))).toEqual(['merge_no_contact']));
  test('no hint when ranges are neighbours', () => expect(rules(mk(A([0, 1]), B([2, 4]), conn('merge')))).toEqual([]));
  test('merge suppresses character overlap', () => expect(rules(mk(A([0, 3], ['F1']), B([1, 4], ['F1']), conn('merge')))).toEqual([]));
});

describe('flashback_order', () => {
  test('hint when B starts at or after A starts', () => expect(rules(mk(A([2, 4]), B([2, 3]), conn('flashback')))).toEqual(['flashback_order']));
  test('no hint when B starts before A starts', () => expect(rules(mk(A([2, 4]), B([0, 1]), conn('flashback')))).toEqual([]));
});

describe('switch rules', () => {
  test('switch_character_missing when no character chosen', () => {
    const [h] = checkBook(mk(A([0, 1]), B([2, 3]), conn('character_switch')));
    expect(h).toMatchObject({ rule: 'switch_character_missing', characterId: null, message: 'Figur wechselt: Figur fehlt.' });
  });
  test('no missing hint when character chosen', () => expect(rules(mk(A([0, 1], ['F1']), B([2, 3], ['F1']), conn('character_switch', 'F1')))).toEqual([]));
  test('switch_character_not_in_both when only in one strand', () => {
    const [h] = checkBook(mk(A([0, 1], ['F1']), B([2, 3]), conn('character_switch', 'F1')));
    expect(h).toMatchObject({ rule: 'switch_character_not_in_both', characterId: 'F1', message: 'Figur wechselt: „Zora“ ist nicht in „Annas Flucht“ und „Der Prozess“ eingetragen.' });
  });
  test('no not_in_both hint when in both', () => expect(rules(mk(A([0, 1], ['F1']), B([2, 3], ['F1']), conn('character_switch', 'F1')))).toEqual([]));
  test('switch exempts only the moving character', () => {
    const hints = checkBook(mk(A([0, 3], ['F1', 'F2']), B([1, 4], ['F1', 'F2']), conn('character_switch', 'F1')));
    expect(hints.map((h) => [h.rule, h.characterId])).toEqual([['character_overlap', 'F2']]);
  });
});

describe('character_overlap', () => {
  test('one hint per shared character on overlap, sorted by name', () => {
    const hints = checkBook(mk(A([0, 3], ['F1', 'F2']), B([2, 4], ['F1', 'F2']), conn('time_jump')));
    expect(hints.map((h) => [h.rule, h.characterId])).toEqual([['time_jump_order', null], ['character_overlap', 'F2'], ['character_overlap', 'F1']]);
    expect(hints[1]!.message).toBe('„Anna“ ist zur selben Zeit in „Annas Flucht“ und „Der Prozess“ eingetragen.');
  });
  test('no hint when ranges do not overlap', () => expect(rules(mk(A([0, 1], ['F1']), B([3, 4], ['F1']), conn('time_jump')))).toEqual([]));
  test('no hint when character only in one strand', () => expect(rules(mk(A([0, 3], ['F1']), B([2, 4]), conn('flashback')))).toEqual(['flashback_order']));
  test('applies to flashback', () => expect(rules(mk(A([2, 4], ['F1']), B([0, 3], ['F1']), conn('flashback')))).toEqual(['character_overlap']));
  test('section characters count for the strand', () =>
    expect(rules(mk(A([0, 3], [], [sectionWith(['F1'])]), B([2, 4], ['F1']), conn('time_jump')))).toEqual(['time_jump_order', 'character_overlap']));
});

describe('strandCharacters', () => {
  test('unions storyline and section characters', () =>
    expect(strandCharacters(A([0, 1], ['F1'], [sectionWith(['F2'])]))).toEqual(new Set(['F1', 'F2'])));
});

describe('acknowledgements and keys', () => {
  const ack: Acknowledgement = { connectionId: 'k1', rule: 'time_jump_order', characterId: null };
  test('hintKey format', () => {
    expect(hintKey({ connectionId: 'k1', rule: 'character_overlap', characterId: 'F1' })).toBe('k1:character_overlap:F1');
    expect(hintKey(ack)).toBe('k1:time_jump_order:');
  });
  test('acknowledged flag set from acknowledgements', () => {
    const hints = checkBook(mk(A([0, 3], ['F1']), B([2, 4], ['F1']), conn('time_jump'), [ack]));
    expect(hints.map((h) => [h.rule, h.acknowledged])).toEqual([['time_jump_order', true], ['character_overlap', false]]);
  });
  test('stale acknowledgement detected after cause fixed', () => {
    expect(staleAcknowledgements(mk(A([0, 2]), B([3, 4]), conn('time_jump'), [ack]))).toEqual([ack]);
    expect(staleAcknowledgements(mk(A([0, 2]), B([2, 4]), conn('time_jump'), [ack]))).toEqual([]);
  });
  test('messages use exact copy', () => {
    const jump = mk(A([0, 2]), B([1, 4]), conn('time_jump'));
    expect(checkConnection(jump, jump.connections[0]!)[0]!.message)
      .toBe('Zeitsprung: „Der Prozess“ beginnt nicht nach dem Ende von „Annas Flucht“.');
    expect(checkBook(mk(A([0, 1]), B([3, 4]), conn('merge')))[0]!.message).toBe('Vereinigung: „Annas Flucht“ und „Der Prozess“ berühren sich zeitlich nicht.');
    expect(checkBook(mk(A([2, 4]), B([2, 3]), conn('flashback')))[0]!.message).toBe('Rückblende: „Der Prozess“ liegt nicht vor dem Beginn von „Annas Flucht“.');
  });
});
