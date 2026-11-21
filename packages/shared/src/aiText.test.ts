import { describe, expect, it } from 'vitest';
import { AiTextBody, draftHasText, fieldLimit, fitSuggestion, targetRange } from './aiText.js';

const uuid = '11111111-1111-4111-8111-111111111111';
const storylineDesc = { kind: 'storyline', storylineId: null, field: 'description' } as const;
const body = (over: Record<string, unknown>) => ({
  target: storylineDesc,
  action: 'rephrase',
  text: 'abc def',
  selection: null,
  draft: {},
  ...over,
});

describe('AiTextBody', () => {
  it('rejects invalid selections', () => {
    expect(AiTextBody.safeParse(body({ selection: { start: 2, end: 1 } })).success).toBe(false);
    expect(AiTextBody.safeParse(body({ selection: { start: 2, end: 99 } })).success).toBe(false);
    expect(AiTextBody.safeParse(body({ text: '  a  b', selection: { start: 0, end: 4 } })).success).toBe(false);
    expect(AiTextBody.safeParse(body({ text: '  a ', selection: { start: 0, end: 4 } })).success).toBe(false);
  });
  it('accepts a valid selection', () => {
    expect(AiTextBody.safeParse(body({ selection: { start: 4, end: 7 } })).success).toBe(true);
  });
  it('enforces action/text rules', () => {
    expect(AiTextBody.safeParse(body({ action: 'generate', text: 'x' })).success).toBe(false);
    expect(AiTextBody.safeParse(body({ action: 'generate', text: '', selection: { start: 0, end: 0 } })).success).toBe(false);
    expect(AiTextBody.safeParse(body({ action: 'rephrase', text: '  ' })).success).toBe(false);
  });
  it('enforces field limits', () => {
    const target = { kind: 'storyline', storylineId: null, field: 'title' };
    expect(AiTextBody.safeParse(body({ target, text: 'x'.repeat(201) })).success).toBe(false);
    expect(AiTextBody.safeParse(body({ target, text: 'x'.repeat(200) })).success).toBe(true);
  });
  it('rejects a connection target with a wrong field', () => {
    const target = { kind: 'connection', fromId: uuid, toId: uuid, type: 'merge', characterId: null, field: 'title' };
    expect(AiTextBody.safeParse(body({ target })).success).toBe(false);
  });
  it('accepts generate on an empty field with a draft', () => {
    const r = AiTextBody.safeParse({ target: storylineDesc, action: 'generate', text: '', selection: null, draft: { title: 'Flucht' } });
    expect(r.success).toBe(true);
  });
});

describe('targetRange', () => {
  it('computes ranges per action', () => {
    expect(targetRange('generate', 'abc', null)).toEqual({ start: 0, end: 0 });
    expect(targetRange('continue', 'abc', null)).toEqual({ start: 3, end: 3 });
    expect(targetRange('continue', 'abc def', { start: 0, end: 3 })).toEqual({ start: 3, end: 3 });
    expect(targetRange('rephrase', 'abc def', { start: 4, end: 7 })).toEqual({ start: 4, end: 7 });
    expect(targetRange('polish', 'abc', null)).toEqual({ start: 0, end: 3 });
  });
});

describe('fitSuggestion', () => {
  const multi = { max: 2000, singleLine: false };
  it('prefixes a space when continuing after a non-space', () => {
    expect(fitSuggestion('weiter.', 'Mira geht', { start: 9, end: 9 }, multi, 'continue')).toBe(' weiter.');
    expect(fitSuggestion(', dann', 'Mira geht', { start: 9, end: 9 }, multi, 'continue')).toBe(', dann');
    expect(fitSuggestion('weiter', 'Mira ', { start: 5, end: 5 }, multi, 'continue')).toBe('weiter');
  });
  it('collapses newlines for single-line fields', () => {
    expect(fitSuggestion('a\nb', '', { start: 0, end: 0 }, { max: 200, singleLine: true }, 'generate')).toBe('a b');
  });
  it('clamps to the remaining room', () => {
    const text = 'x'.repeat(195);
    expect(fitSuggestion('y'.repeat(50), text, { start: 0, end: 5 }, { max: 200, singleLine: false }, 'rephrase')).toHaveLength(10);
  });
});

describe('draftHasText', () => {
  it('checks other fields of the owning object', () => {
    const t = { kind: 'storyline', storylineId: null, field: 'title' } as const;
    expect(draftHasText(t, {})).toBe(false);
    expect(draftHasText(t, { characterIds: [uuid] })).toBe(true);
    const c = { kind: 'character', characterId: uuid, field: 'name' } as const;
    expect(draftHasText(c, { name: 'Jon' })).toBe(false);
    expect(draftHasText(c, { behavior: 'ruhig' })).toBe(true);
  });
  it('is always true for section, addition and connection', () => {
    expect(draftHasText({ kind: 'section', storylineId: uuid, sectionId: null, field: 'note' }, {})).toBe(true);
    expect(draftHasText({ kind: 'addition', storylineId: uuid, characterId: uuid, field: 'behavior' }, {})).toBe(true);
    expect(draftHasText({ kind: 'connection', fromId: uuid, toId: uuid, type: 'merge', characterId: null, field: 'label' }, {})).toBe(true);
  });
});

describe('sceneBlock target', () => {
  const target = { kind: 'sceneBlock', assignmentId: uuid, blockId: uuid, field: 'text' } as const;

  it('accepts generate on empty text, with and without length', () => {
    expect(AiTextBody.safeParse(body({ target, action: 'generate', text: '' })).success).toBe(true);
    expect(AiTextBody.safeParse(body({ target, action: 'generate', text: '', length: 'long' })).success).toBe(true);
    expect(AiTextBody.safeParse(body({ target, action: 'generate', text: '', length: 'huge' })).success).toBe(false);
  });

  it('allows 10000 characters and counts as having context', () => {
    expect(fieldLimit(target)).toEqual({ max: 10000, singleLine: false });
    expect(draftHasText(target, {})).toBe(true);
  });
});
