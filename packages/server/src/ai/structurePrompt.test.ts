/** Unit tests for parsing the AI structure proposal. */
import { describe, expect, test } from 'vitest';
import { AiError } from './client.js';
import type { Book } from '@bookly/shared';
import { draftRequest, parseStructure, structureRequest, type KnownIds } from './structurePrompt.js';
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
    expect(req.system).not.toContain(STYLE_VOICE);
    expect(req.system).not.toContain('"stil"');
    expect(Object.keys(JSON.parse(req.user))).toEqual(['buch', 'kapitel', 'baustein', 'inhalt', 'quelle', 'figuren', 'szenen', 'vorherigerText']);
  });
});

describe('structureRequest', () => {
  test('asks for concrete titles and synopses without stock phrases and passes the style on', () => {
    const book = { title: 'B', timePoints: [], characters: [], storylines: [] } as unknown as Book;
    const req = structureRequest(book, { scenes: [], assignments: [] }, [], { style: 'Knapp' });
    expect(req.system).toContain('Floskeln');
    expect(req.system).toContain('"stil"');
    expect(req.system).toContain('Ton');
    expect(JSON.parse(req.user).stil).toBe('Knapp');
  });
});
