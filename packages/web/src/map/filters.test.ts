/** Tests for the pure map filters and their localStorage persistence. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book, Storyline } from '@bookly/shared';
import { sampleBook } from '../book/testFixtures';
import { applyFilters, defaultFilterState, loadFilterState, saveFilterState, toMapFilter, type MapFilter } from './filters';

const none: MapFilter = { mainOnly: false, openOnly: false, range: null, characterIds: [] };

function story(over: Partial<Storyline> & Pick<Storyline, 'id'>): Storyline {
  return {
    title: over.id, description: '', characterIds: [], range: { startId: 't1', endId: 't1' }, kind: 'side',
    status: 'in_progress', color: '#8A94A6', note: null, sections: [], ...over,
  };
}

function book(): Book {
  return {
    ...sampleBook(),
    storylines: [
      story({ id: 'a', kind: 'main', range: { startId: 't1', endId: 't2' }, characterIds: ['c1'] }),
      story({ id: 'b', kind: 'side', status: 'open', range: { startId: 't2', endId: 't3' }, characterIds: ['c2'] }),
      story({
        id: 'c', kind: 'side', status: 'completed', range: { startId: 't3', endId: 't3' },
        sections: [{ id: 'x', storylineId: 'c', title: 'S', description: '', characterIds: ['c1'], range: { startId: 't3', endId: 't3' }, note: null, order: 0 }],
      }),
    ],
  };
}

const ids = (f: Partial<MapFilter>) => [...applyFilters(book(), { ...none, ...f })].sort();

describe('applyFilters', () => {
  it('shows everything without criteria', () => expect(ids({})).toEqual(['a', 'b', 'c']));
  it('mainOnly keeps main strands', () => expect(ids({ mainOnly: true })).toEqual(['a']));
  it('openOnly keeps status open', () => expect(ids({ openOnly: true })).toEqual(['b']));
  it('range keeps overlapping storylines', () => {
    expect(ids({ range: { startId: 't1', endId: 't1' } })).toEqual(['a']);
    expect(ids({ range: { startId: 't2', endId: 't2' } })).toEqual(['a', 'b']);
  });
  it('range accepts reversed endpoints', () => expect(ids({ range: { startId: 't3', endId: 't3' } })).toEqual(['b', 'c']));
  it('characters match any, including section characters', () => {
    expect(ids({ characterIds: ['c2'] })).toEqual(['b']);
    expect(ids({ characterIds: ['c1'] })).toEqual(['a', 'c']);
    expect(ids({ characterIds: ['c1', 'c2'] })).toEqual(['a', 'b', 'c']);
  });
  it('combines criteria with AND', () => {
    expect(ids({ openOnly: true, characterIds: ['c1'] })).toEqual([]);
    expect(ids({ mainOnly: true, characterIds: ['c1'], range: { startId: 't2', endId: 't3' } })).toEqual(['a']);
  });
});

describe('toMapFilter', () => {
  const tps = book().timePoints;
  it('has no range when neither end is set', () => expect(toMapFilter(defaultFilterState(), tps).range).toBeNull());
  it('treats a missing end as book start/end', () => {
    expect(toMapFilter({ ...defaultFilterState(), fromId: 't2' }, tps).range).toEqual({ startId: 't2', endId: 't3' });
    expect(toMapFilter({ ...defaultFilterState(), toId: 't2' }, tps).range).toEqual({ startId: 't1', endId: 't2' });
  });
});

/** In-memory Storage; Node 26 exposes a broken global localStorage that shadows jsdom's. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('filter persistence', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', memoryStorage());
  });
  it('round-trips per book', () => {
    saveFilterState('b1', { ...defaultFilterState(), mainOnly: true, characterIds: ['c1'], showNotes: true });
    expect(loadFilterState('b1', book())).toMatchObject({ mainOnly: true, characterIds: ['c1'], showNotes: true });
    expect(loadFilterState('other', book())).toEqual(defaultFilterState());
  });
  it('drops ids that no longer exist', () => {
    saveFilterState('b1', { ...defaultFilterState(), characterIds: ['c1', 'gone'], fromId: 'gone', toId: 't2' });
    expect(loadFilterState('b1', book())).toMatchObject({ characterIds: ['c1'], fromId: null, toId: 't2' });
  });
  it('falls back to defaults on corrupt data', () => {
    localStorage.setItem('bookly:filters:b1', '{nope');
    expect(loadFilterState('b1', book())).toEqual(defaultFilterState());
  });
  it('survives a throwing localStorage', () => {
    const denied = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', { getItem: denied, setItem: denied });
    expect(loadFilterState('b1', book())).toEqual(defaultFilterState());
    expect(() => saveFilterState('b1', defaultFilterState())).not.toThrow();
  });
});
