import { describe, expect, test } from 'vitest';
import type { Book, Section, Storyline } from './domain.js';
import { timePointUsages, validateBook } from './validation.js';

const tp = (i: number) => ({ id: `T${i}`, name: `Zeit ${i}`, position: i * 10 });

function section(id: string, start: string, end: string, over: Partial<Section> = {}): Section {
  return { id, storylineId: 's1', title: `Abschnitt ${id}`, description: '', characterIds: [], range: { startId: start, endId: end }, note: null, order: 0, ...over };
}

function storyline(over: Partial<Storyline> = {}): Storyline {
  return {
    id: 's1', title: 'Annas Flucht', description: '', characterIds: ['c1'], range: { startId: 'T0', endId: 'T4' },
    kind: 'main', status: 'in_progress', color: '#2B59C3', note: null, additions: [], sections: [], ...over,
  };
}

function book(over: Partial<Book> = {}): Book {
  return {
    id: 'b1', title: 'Buch', timePoints: [0, 1, 2, 3, 4].map(tp),
    characters: [{ id: 'c1', name: 'Anna', description: null, behavior: null, intentions: null }],
    storylines: [storyline({ sections: [section('x1', 'T0', 'T2', { title: 'Aufbruch' })] }), storyline({ id: 's2', title: 'Neben', kind: 'side' })],
    connections: [{ id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null }],
    acknowledgements: [], ...over,
  };
}

const conn = (over: Partial<Book['connections'][number]>): Book['connections'] => [
  { id: 'k1', fromId: 's1', toId: 's2', type: 'time_jump', label: null, characterId: null, ...over },
];
const codes = (b: Book) => validateBook(b).map((i) => i.code);
const withMain = (sections: Section[], over: Partial<Storyline> = {}) =>
  book({ storylines: [storyline({ sections, ...over })], connections: [] });
const withLine = (over: Partial<Storyline>) => book({ storylines: [storyline(over)], connections: [] });

describe('validateBook', () => {
  test('valid book has no issues', () => expect(validateBook(book())).toEqual([]));
  test('range_inverted', () => expect(codes(withLine({ range: { startId: 'T3', endId: 'T1' } }))).toEqual(['range_inverted']));
  test('range_inverted on a section', () => expect(codes(withMain([section('x1', 'T3', 'T1')]))).toEqual(['range_inverted']));
  test('unknown_time_point', () => expect(codes(withLine({ range: { startId: 'T0', endId: 'nope' } }))).toEqual(['unknown_time_point']));
  test('unknown_character', () => expect(codes(withLine({ characterIds: ['zz'] }))).toEqual(['unknown_character']));
  test('unknown_character on connection', () => expect(codes(book({ connections: conn({ type: 'character_switch', characterId: 'zz' }) }))).toEqual(['unknown_character']));
  test('section_on_side_strand', () => expect(codes(withMain([section('x1', 'T0', 'T1')], { kind: 'side' }))).toEqual(['section_on_side_strand']));
  test('section_outside_strand', () => expect(codes(withMain([section('x1', 'T0', 'T3')], { range: { startId: 'T0', endId: 'T2' } }))).toEqual(['section_outside_strand']));
  test('sections_overlap', () => expect(codes(withMain([section('x1', 'T0', 'T3'), section('x2', 'T2', 'T4')]))).toEqual(['sections_overlap']));
  test('sections sharing a boundary are fine', () => expect(codes(withMain([section('x1', 'T0', 'T2'), section('x2', 'T2', 'T4')]))).toEqual([]));
  test('self_connection', () => expect(codes(book({ connections: conn({ toId: 's1' }) }))).toEqual(['self_connection']));
  test('unknown_storyline on connection', () => expect(codes(book({ connections: conn({ toId: 'zz' }) }))).toEqual(['unknown_storyline']));
  test('unknown_storyline on section storylineId mismatch', () => expect(codes(withMain([section('x1', 'T0', 'T1', { storylineId: 'other' })]))).toEqual(['unknown_storyline']));
  test('empty_title', () => expect(codes(withLine({ title: '   ' }))).toEqual(['empty_title']));
  test('empty_title on a section', () => expect(codes(withMain([section('x1', 'T0', 'T1', { title: '' })]))).toEqual(['empty_title']));
  test('switch connection without character is valid', () => expect(codes(book({ connections: conn({ type: 'character_switch', characterId: null }) }))).toEqual([]));
  test('message is German and names the title', () => {
    expect(validateBook(withLine({ range: { startId: 'T3', endId: 'T1' } }))).toEqual([
      { code: 'range_inverted', elementId: 's1', message: 'Storyline „Annas Flucht“: Beginn liegt nach dem Ende.' },
    ]);
  });
});

describe('timePointUsages', () => {
  const b = book({ storylines: [storyline({ range: { startId: 'T0', endId: 'T2' }, sections: [section('x1', 'T0', 'T2', { title: 'Aufbruch' })] })], connections: [] });
  test('lists storyline and section titles', () =>
    expect(timePointUsages(b, 'T2')).toEqual([
      { kind: 'storyline', id: 's1', title: 'Annas Flucht' },
      { kind: 'section', id: 'x1', title: 'Aufbruch' },
    ]));
  test('unused time point has no usages', () => expect(timePointUsages(b, 'T3')).toEqual([]));
});
