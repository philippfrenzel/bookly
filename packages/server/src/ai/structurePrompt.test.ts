/** Unit tests for the AI structure proposal (request and parsing) and the draft request's length guidance. */
import { describe, expect, test } from 'vitest';
import { AiError } from './client.js';
import type { Book } from '@bookly/shared';
import { draftRequest, parseStructure, structureRequest, type DraftContext, type KnownIds, type SceneInfo } from './structurePrompt.js';
import { NATURAL_PROSE, STYLE_VOICE } from './stylePrompt.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const S = '00000000-0000-4000-8000-00000000000c';
const ids: KnownIds = { chapters: new Set([A]), blocks: new Set([B]), sections: new Set([S]), storylines: new Set(), scenes: new Set() };
const block = (over: object) => ({ blockId: null, title: 'Neu', synopsis: '', sectionId: null, storylineId: null, sceneIds: [], ...over });

describe('parseStructure', () => {
  test('keeps known ids once, drops unknown blocks and references, falls back on titles', () => {
    const parsed = parseStructure({
      summary: 'ok',
      chapters: [
        { chapterId: A, title: '', reason: 'r', blocks: [block({ blockId: B }), block({ blockId: B }), block({ blockId: 'weg' }), block({ sectionId: S, sceneIds: ['x'] })] },
        { chapterId: A, title: 'Zwei', reason: '', blocks: [block({ storylineId: 'unbekannt' })] },
        { chapterId: null, title: 'Leer', reason: '', blocks: [] },
      ],
    }, ids);
    expect(parsed.chapters).toEqual([
      { chapterId: A, title: 'Kapitel 1', reason: 'r', blocks: [block({ blockId: B }), block({ sectionId: S })] },
      { chapterId: null, title: 'Zwei', reason: '', blocks: [block({})] },
    ]);
  });

  test('throws when nothing usable is left', () => {
    expect(() => parseStructure({ summary: '', chapters: [] }, ids)).toThrow(AiError);
    expect(() => parseStructure(null, ids)).toThrow(AiError);
  });
});

/** The draft system prompt without length guidance (as on main); must stay byte-identical. */
const OLD_DRAFT_SYSTEM = [
  'Du schreibst für eine Autorin oder einen Autor einen ersten Entwurf einer Romanpassage auf Deutsch.',
  'Erzähle, was im Inhalt des Bausteins steht, mit den genannten Figuren am genannten Schauplatz.',
  'Schließe stilistisch und inhaltlich an den vorherigen Text an, falls vorhanden. Wiederhole den vorherigen Text nicht, sondern setze nach ihm ein. Etwa 300 bis 600 Wörter.',
  'Setze wörtliche Rede in deutsche Anführungszeichen („…“).',
  'Halte dich vorrangig an die "anweisung" des Autors, falls vorhanden.',
  NATURAL_PROSE,
  'Der Ton des vorherigen Textes geht den allgemeinen Abwechslungsregeln vor.',
  'Kein Titel, keine Erklärungen. Antworte als JSON-Objekt mit dem Feld "text".',
].join(' ');

const lengthCtx: DraftContext = {
  bookTitle: 'Roman', chapterTitle: 'K1', title: 'Ankunft', synopsis: '', source: null, characters: [], scenes: [], previousText: '',
};

describe('draftRequest length guidance', () => {
  test('without range and with book length the system prompt is unchanged', () => {
    expect(draftRequest(lengthCtx).system).toBe(OLD_DRAFT_SYSTEM);
    expect(draftRequest({ ...lengthCtx, targetWords: null, length: 'book' }).system).toBe(OLD_DRAFT_SYSTEM);
  });

  test('short without range asks for 150 to 300 words', () => {
    const { system } = draftRequest({ ...lengthCtx, length: 'short' });
    expect(system).toContain('Etwa 150 bis 300 Wörter.');
    expect(system).not.toContain('300 bis 600');
  });

  test('with a range the book total replaces the fixed span', () => {
    const { system } = draftRequest({ ...lengthCtx, targetWords: { min: 60000, max: 90000 }, length: 'long' });
    expect(system).toContain('60000–90000');
    expect(system).toContain('Schreibe eher ausführlich.');
    expect(system).not.toContain('300 bis 600');
    expect(system).not.toContain('pro Szene');
  });

  test('length guidance and style voice combine', () => {
    const { system } = draftRequest({ ...lengthCtx, length: 'short', style: 'Knapp' });
    expect(system).toContain('Etwa 150 bis 300 Wörter.');
    expect(system).toContain(STYLE_VOICE);
  });
});

const draftCtx = { bookTitle: 'B', chapterTitle: 'K', title: 'T', synopsis: 'S', source: null, characters: [], scenes: [], previousText: 'Vorher.' };

describe('draftRequest', () => {
  test('with a style: natural prose, then precedence sentence, then the style voice', () => {
    const { system } = draftRequest({ ...draftCtx, style: 'Knapp: kurze Sätze.' });
    expect(system).toContain(NATURAL_PROSE);
    expect(system).toContain(STYLE_VOICE);
    expect(system.indexOf('vorrangig an die "anweisung"')).toBeGreaterThan(-1);
    expect(system.indexOf('vorrangig an die "anweisung"')).toBeLessThan(system.indexOf(STYLE_VOICE));
  });

  test('without a style: no voice rule, payload shape unchanged', () => {
    const req = draftRequest(draftCtx);
    expect(req.system).toContain(NATURAL_PROSE);
    expect(req.system).toContain('Wiederhole den vorherigen Text nicht');
    expect(req.system).toContain('„…“');
    expect(req.system).not.toContain(STYLE_VOICE);
    expect(req.system).not.toContain('"stil"');
    expect(req.system).toContain('Ton des vorherigen Textes geht den allgemeinen Abwechslungsregeln vor');
    expect(Object.keys(JSON.parse(req.user))).toEqual(['buch', 'kapitel', 'baustein', 'inhalt', 'quelle', 'figuren', 'szenen', 'vorherigerText']);
  });
});

describe('draftRequest payload with instruction and style', () => {
  test('orders anweisung before stil before vorherigerText', () => {
    const keys = Object.keys(JSON.parse(draftRequest({ ...draftCtx, instruction: 'Kürzer.', style: 'Knapp' }).user));
    expect(keys.indexOf('anweisung')).toBeGreaterThan(-1);
    expect(keys.indexOf('anweisung')).toBeLessThan(keys.indexOf('stil'));
    expect(keys.indexOf('stil')).toBeLessThan(keys.indexOf('vorherigerText'));
  });
});

describe('structureRequest', () => {
  const SEC = '00000000-0000-4000-8000-0000000000d1';
  const LINE = '00000000-0000-4000-8000-0000000000d2';
  const SCENE = '00000000-0000-4000-8000-0000000000d3';
  const TP = '00000000-0000-4000-8000-0000000000d4';
  const book = (targetWords: Book['targetWords']): Book => ({
    id: 'b', title: 'Roman', timePoints: [{ id: TP, name: 'T0' }] as Book['timePoints'], characters: [], connections: [], acknowledgements: [],
    storylines: [{
      id: LINE, title: 'Reise', kind: 'main', description: '', characterIds: [], range: { startId: TP, endId: TP },
      sections: [{ id: SEC, title: 'Ankunft', description: '', characterIds: [], range: { startId: TP, endId: TP } }],
    }] as unknown as Book['storylines'],
    targetWords,
  });
  const sceneInfo: SceneInfo = {
    scenes: [{ id: SCENE, name: 'Bergsee' }],
    assignments: [{ id: 'a', sceneId: SCENE, sectionId: SEC, storylineId: null, description: 'x'.repeat(5000), blocks: [], revision: 0, updatedAt: '' }],
  };

  test('slices scene descriptions to 2000 characters and adds zielumfang only with a range', () => {
    const without = JSON.parse(structureRequest(book(null), sceneInfo, []).user);
    expect(without.zielumfang).toBeUndefined();
    expect(without.storylines[0].abschnitte[0].szenen[0].beschreibung).toHaveLength(2000);
    const withRange = JSON.parse(structureRequest(book({ min: 60000, max: 90000 }), sceneInfo, []).user);
    expect(withRange.zielumfang).toContain('60000–90000');
  });

  test('asks for concrete titles and synopses without stock phrases and passes the style on', () => {
    const book = { title: 'B', timePoints: [], characters: [], storylines: [] } as unknown as Book;
    const req = structureRequest(book, { scenes: [], assignments: [] }, [], { style: 'Knapp' });
    expect(req.system).toContain('Floskeln');
    expect(req.system).toContain('"stil"');
    expect(req.system).toContain('Ton');
    expect(JSON.parse(req.user).stil).toBe('Knapp');
  });
});
