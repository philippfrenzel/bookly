/** Unit tests for parsing the AI structure proposal. */
import { describe, expect, test } from 'vitest';
import { AiError } from './client.js';
import { parseStructure, type KnownIds } from './structurePrompt.js';

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
