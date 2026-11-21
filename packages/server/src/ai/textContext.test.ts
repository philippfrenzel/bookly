/** Tests for the AI text context builder (plain Book objects, no database). */
import { describe, expect, it } from 'vitest';
import type { AiTextBody, Book, Section, Storyline } from '@bookly/shared';
import { NotFoundError } from '../errors.js';
import { buildTextContext } from './textContext.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T1 = id(1), T2 = id(2), ANNA = id(3), BEN = id(4), S1 = id(5), S2 = id(6);
const SEC1 = id(7), SEC2 = id(8), SEC3 = id(9), FOREIGN = id(99);
const range = { startId: T1, endId: T2 };

const section = (sid: string, title: string, order: number): Section => ({
  id: sid, storylineId: S1, title, description: `${title}-desc`, characterIds: [ANNA], range, note: null, order,
});

function makeBook(): Book {
  const s1: Storyline = {
    id: S1, title: 'Hauptlinie', description: 'alt', characterIds: [ANNA], range, kind: 'main', status: 'open',
    color: '#000', note: null, additions: [{ characterId: ANNA, behavior: 'mutig', intentions: null }],
    // Deliberately out of order to check sorting.
    sections: [section(SEC3, 'Drei', 3), section(SEC1, 'Eins', 1), section(SEC2, 'Zwei', 2)],
  };
  const s2: Storyline = { ...s1, id: S2, title: 'Nebenlinie', description: 'nd', characterIds: [], additions: [], sections: [] };
  return {
    id: id(100), title: 'Mein Buch',
    timePoints: [{ id: T1, name: 'Start', position: 0 }, { id: T2, name: 'Ende', position: 1 }],
    characters: [
      { id: ANNA, name: 'Anna', description: 'Heldin', behavior: null, intentions: null },
      { id: BEN, name: 'Ben', description: null, behavior: null, intentions: null },
    ],
    storylines: [s1, s2], connections: [], acknowledgements: [],
  };
}

const body = (target: AiTextBody['target'], draft: AiTextBody['draft'] = {}): AiTextBody => ({
  target, action: 'rephrase', text: 'x', selection: null, draft,
});
const ctx = (r: { context: Record<string, unknown> }) => r.context as any;

describe('buildTextContext', () => {
  it('merges draft over stored storyline fields', () => {
    const r = buildTextContext(makeBook(), body({ kind: 'storyline', storylineId: S1, field: 'title' }, { description: 'neu' }));
    expect(ctx(r).storyline.beschreibung).toBe('neu');
    expect(ctx(r).storyline.zeitraum).toBe('Start – Ende');
    expect(ctx(r).storyline.abschnitte.map((a: { titel: string }) => a.titel)).toEqual(['Eins', 'Zwei', 'Drei']);
    expect(r.fieldLabel).toBe('Titel');
  });

  it('new storyline uses only the draft', () => {
    const r = buildTextContext(makeBook(), body({ kind: 'storyline', storylineId: null, field: 'description' }, { title: 'Flucht', characterIds: [ANNA] }));
    expect(ctx(r).figuren[0].name).toBe('Anna');
    expect(ctx(r).storyline.titel).toBe('Flucht');
    expect(r.hasText).toBe(true);
  });

  it('new storyline without text has no context text', () => {
    const r = buildTextContext(makeBook(), body({ kind: 'storyline', storylineId: null, field: 'description' }, { characterIds: [] }));
    expect(r.hasText).toBe(false);
  });

  it('section has neighbours', () => {
    const book = makeBook();
    const mid = buildTextContext(book, body({ kind: 'section', storylineId: S1, sectionId: SEC2, field: 'note' }));
    expect(ctx(mid).vorher.titel).toBe('Eins');
    expect(ctx(mid).nachher.titel).toBe('Drei');
    expect(ctx(mid).abschnitt.titel).toBe('Zwei');
    const fresh = buildTextContext(book, body({ kind: 'section', storylineId: S1, sectionId: null, field: 'description' }, { title: 'Neu' }));
    expect(ctx(fresh).vorher.titel).toBe('Drei');
    expect(ctx(fresh).nachher).toBeNull();
    expect(fresh.fieldLabel).toBe('Kurzbeschreibung');
  });

  it('character lists its storylines', () => {
    const r = buildTextContext(makeBook(), body({ kind: 'character', characterId: ANNA, field: 'behavior' }));
    expect(ctx(r).storylines).toEqual(['Hauptlinie']);
    expect(ctx(r).figur.name).toBe('Anna');
    expect(r.hasText).toBe(true);
  });

  it('addition requires a linked character', () => {
    const book = makeBook();
    expect(() => buildTextContext(book, body({ kind: 'addition', storylineId: S1, characterId: BEN, field: 'behavior' }))).toThrow(NotFoundError);
    const ok = buildTextContext(book, body({ kind: 'addition', storylineId: S1, characterId: ANNA, field: 'intentions' }));
    expect(ctx(ok).ergaenzung.verhalten).toBe('mutig');
    expect(ctx(ok).grundprofil.name).toBe('Anna');
    expect(ctx(ok).hinweis).toBe('Nur Abweichungen vom Grundprofil beschreiben.');
  });

  it('connection has type label, endpoints and character', () => {
    const r = buildTextContext(makeBook(), body({ kind: 'connection', fromId: S1, toId: S2, type: 'time_jump', characterId: ANNA, field: 'label' }));
    expect(ctx(r).typ).toBe('Zeitsprung');
    expect(ctx(r).von.titel).toBe('Hauptlinie');
    expect(ctx(r).nach.titel).toBe('Nebenlinie');
    expect(ctx(r).figur).toBe('Anna');
  });

  it('foreign ids throw NotFoundError for each kind', () => {
    const book = makeBook();
    const targets: AiTextBody['target'][] = [
      { kind: 'storyline', storylineId: FOREIGN, field: 'title' },
      { kind: 'section', storylineId: FOREIGN, sectionId: null, field: 'title' },
      { kind: 'section', storylineId: S1, sectionId: FOREIGN, field: 'title' },
      { kind: 'character', characterId: FOREIGN, field: 'name' },
      { kind: 'addition', storylineId: S1, characterId: FOREIGN, field: 'behavior' },
      { kind: 'connection', fromId: FOREIGN, toId: S2, type: 'merge', characterId: null, field: 'label' },
      { kind: 'connection', fromId: S1, toId: S2, type: 'merge', characterId: FOREIGN, field: 'label' },
    ];
    for (const t of targets) expect(() => buildTextContext(book, body(t))).toThrow(NotFoundError);
  });

  it('labels the description field per kind', () => {
    const book = makeBook();
    expect(buildTextContext(book, body({ kind: 'storyline', storylineId: S1, field: 'description' })).fieldLabel).toBe('Kurzbeschreibung');
    expect(buildTextContext(book, body({ kind: 'character', characterId: ANNA, field: 'description' })).fieldLabel).toBe('Beschreibung');
  });
});
