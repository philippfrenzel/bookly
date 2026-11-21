/** Unit tests for the scene description prompt and parser. */
import { describe, expect, test } from 'vitest';
import { AiError } from './client.js';
import { parseSceneDescription, sceneDescriptionRequest, selectNotes } from './scenePrompt.js';

const base = { bookTitle: 'Roman', sceneName: 'Bergsee', notes: [] as string[], image: null, section: null };

describe('selectNotes', () => {
  test('drops blank notes and stops at the budget', () => {
    expect(selectNotes([' a ', '', 'bb', 'ccc'], 3)).toEqual({ notes: ['a', 'bb'], chars: 3, omitted: 1 });
  });
});

describe('sceneDescriptionRequest', () => {
  test('notes only: no image part (EC-001)', () => {
    const req = sceneDescriptionRequest({ ...base, notes: ['Nebel über dem Wasser'] });
    expect(req.images).toBeUndefined();
    expect(JSON.parse(req.user)).toMatchObject({ szene: 'Bergsee', notizen: ['Nebel über dem Wasser'], bild: 'kein Bild' });
    expect(req.schemaName).toBe('scene_description');
  });

  test('image only: the image is attached (EC-002)', () => {
    const image = { mime: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff]) };
    const req = sceneDescriptionRequest({ ...base, image });
    expect(req.images).toEqual([image]);
    expect(JSON.parse(req.user).notizen).toEqual([]);
  });

  test('section context is included when given', () => {
    const req = sceneDescriptionRequest({ ...base, notes: ['x'], section: { title: 'Ankunft', description: 'Sie kommt an.', storylineTitle: 'Reise' } });
    expect(JSON.parse(req.user).abschnitt).toEqual({ titel: 'Ankunft', beschreibung: 'Sie kommt an.', storyline: 'Reise' });
  });
});

describe('parseSceneDescription', () => {
  test('trims and limits to 2000 characters', () => {
    expect(parseSceneDescription({ description: '  Ein See.  ' })).toBe('Ein See.');
    expect(parseSceneDescription({ description: 'x'.repeat(2500) })).toHaveLength(2000);
  });

  test('rejects empty or malformed answers', () => {
    expect(() => parseSceneDescription({ description: ' ' })).toThrow(AiError);
    expect(() => parseSceneDescription({ text: 'x' })).toThrow(AiError);
    expect(() => parseSceneDescription(null)).toThrow(AiError);
  });
});
