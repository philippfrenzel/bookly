/** Tests for the scene bodies and pure scene rules. */
import { describe, expect, test } from 'vitest';
import { BLOCK_SEPARATOR, SCENE_BLOCK_LIMITS, SceneBlocksBody, descriptionToBlocks, joinBlocks, splitBlockText, hasSceneContext, previousDescriptions, SceneAssignmentCreateBody, SceneAssignmentPatchBody, SceneBody, SceneNoteBody, parseTargetKey, targetKey, type SceneAssignment } from './scenes.js';

const a = (id: string, sceneId: string, description: string, updatedAt: string): SceneAssignment =>
  ({ id, sceneId, sectionId: `sec-${id}`, storylineId: null, description, blocks: [{ id, text: description }], revision: 0, updatedAt });

describe('scene bodies', () => {
  test('assignment patch changes the description, the section, or both, but not nothing', () => {
    const sec = '00000000-0000-4000-8000-000000000001';
    expect(SceneAssignmentPatchBody.parse({ description: ' See ' })).toEqual({ description: 'See' });
    expect(SceneAssignmentPatchBody.parse({ sectionId: sec })).toEqual({ sectionId: sec });
    expect(SceneAssignmentPatchBody.safeParse({}).success).toBe(false);
    expect(SceneAssignmentPatchBody.safeParse({ sectionId: 'x' }).success).toBe(false);
    expect(SceneAssignmentPatchBody.safeParse({ sectionId: sec, storylineId: sec }).success).toBe(false);
    expect(SceneAssignmentPatchBody.parse({ storylineId: sec })).toEqual({ storylineId: sec });
  });

  test('assignment create needs exactly one target', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(SceneAssignmentCreateBody.safeParse({ sceneId: id, storylineId: id }).success).toBe(true);
    expect(SceneAssignmentCreateBody.safeParse({ sceneId: id }).success).toBe(false);
    expect(SceneAssignmentCreateBody.safeParse({ sceneId: id, sectionId: id, storylineId: id }).success).toBe(false);
  });

  test('target keys round-trip', () => {
    expect(parseTargetKey(targetKey({ sectionId: 'a', storylineId: null }))).toEqual({ sectionId: 'a' });
    expect(parseTargetKey(targetKey({ sectionId: null, storylineId: 'b' }))).toEqual({ storylineId: 'b' });
  });

  test('name is trimmed and required', () => {
    expect(SceneBody.parse({ name: '  See  ' })).toEqual({ name: 'See' });
    expect(SceneBody.safeParse({ name: '   ' }).success).toBe(false);
    expect(SceneBody.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
  });

  test('note allows 10000 characters and blank text', () => {
    expect(SceneNoteBody.safeParse({ text: 'x'.repeat(10000) }).success).toBe(true);
    expect(SceneNoteBody.safeParse({ text: 'x'.repeat(10001) }).success).toBe(false);
    expect(SceneNoteBody.parse({ text: ' ' })).toEqual({ text: '' });
  });

  test('assignment description defaults to empty and is limited to what the blocks can hold', () => {
    const ids = { sceneId: '11111111-1111-4111-8111-111111111111', sectionId: '22222222-2222-4222-8222-222222222222' };
    const max = SCENE_BLOCK_LIMITS.count * (SCENE_BLOCK_LIMITS.text + 2);
    expect(SceneAssignmentCreateBody.parse(ids).description).toBe('');
    expect(SceneAssignmentCreateBody.safeParse({ ...ids, description: 'x'.repeat(2001) }).success).toBe(true);
    expect(SceneAssignmentCreateBody.safeParse({ ...ids, description: 'x'.repeat(max) }).success).toBe(true);
    expect(SceneAssignmentCreateBody.safeParse({ ...ids, description: 'x'.repeat(max + 1) }).success).toBe(false);
    expect(SceneAssignmentPatchBody.safeParse({ description: 'x'.repeat(5000) }).success).toBe(true);
    expect(SceneAssignmentPatchBody.safeParse({ description: 'x'.repeat(max + 1) }).success).toBe(false);
  });
});

describe('hasSceneContext', () => {
  test('image or a non-blank note counts, blank notes do not (EC-001..003)', () => {
    const image = { mime: 'image/png' as const, size: 1, version: 'v' };
    expect(hasSceneContext({ image: null, notes: [] })).toBe(false);
    expect(hasSceneContext({ image: null, notes: [{ id: 'n', text: '  ' }] })).toBe(false);
    expect(hasSceneContext({ image: null, notes: [{ id: 'n', text: 'Nebel' }] })).toBe(true);
    expect(hasSceneContext({ image, notes: [] })).toBe(true);
  });
});

describe('previousDescriptions', () => {
  test('newest first, distinct, blank and other scenes left out (FR-005)', () => {
    const list = [
      a('1', 's', 'Alt', '2026-01-01T00:00:00.000Z'),
      a('2', 's', 'Neu', '2026-03-01T00:00:00.000Z'),
      a('3', 's', '', '2026-04-01T00:00:00.000Z'),
      a('4', 'other', 'Fremd', '2026-05-01T00:00:00.000Z'),
      a('5', 's', 'Alt', '2026-02-01T00:00:00.000Z'),
    ];
    expect(previousDescriptions('s', list)).toEqual(['Neu', 'Alt']);
    expect(previousDescriptions('none', list)).toEqual([]);
  });
});

describe('scene blocks', () => {
  const id1 = '00000000-0000-4000-8000-000000000001';
  const id2 = '00000000-0000-4000-8000-000000000002';

  test('splitBlockText splits at the caret without trimming', () => {
    const text = 'Mara fragte. „Jon antwortete.“';
    const parts = splitBlockText(text, 13);
    expect(parts).toEqual(['Mara fragte. ', '„Jon antwortete.“']);
    expect(parts![0] + parts![1]).toBe(text);
    expect(splitBlockText(text, 0)).toBeNull();
    expect(splitBlockText(text, text.length)).toBeNull();
  });

  test('splitBlockText refuses a non-integer caret and one inside a surrogate pair', () => {
    const text = 'a😀b';
    expect(splitBlockText(text, 1.5)).toBeNull();
    expect(splitBlockText(text, Number.NaN)).toBeNull();
    expect(splitBlockText(text, 2)).toBeNull();
    expect(splitBlockText(text, 1)).toEqual(['a', '😀b']);
    expect(splitBlockText(text, 3)).toEqual(['a😀', 'b']);
  });

  test('descriptionToBlocks splits on the separator and joins back exactly', () => {
    expect(descriptionToBlocks('')).toEqual(['']);
    expect(descriptionToBlocks('Ein See.')).toEqual(['Ein See.']);
    expect(descriptionToBlocks('A\n\nB\nC\n\n\n\nD')).toEqual(['A', 'B\nC', '', 'D']);
    for (const text of ['', 'A\n\nB', 'A\n\n\nB', '\n\nA\n\n', ' x \n\n y ']) expect(joinBlocks(descriptionToBlocks(text))).toBe(text);
  });

  test('descriptionToBlocks merges everything past the block limit into the last block', () => {
    const parts = Array.from({ length: SCENE_BLOCK_LIMITS.count + 5 }, (_, i) => `P${i}`);
    const text = joinBlocks(parts);
    const blocks = descriptionToBlocks(text);
    expect(blocks).toHaveLength(SCENE_BLOCK_LIMITS.count);
    expect(blocks.slice(0, -1)).toEqual(parts.slice(0, SCENE_BLOCK_LIMITS.count - 1));
    expect(blocks.at(-1)).toBe(joinBlocks(parts.slice(SCENE_BLOCK_LIMITS.count - 1)));
    expect(joinBlocks(blocks)).toBe(text);
  });

  test('joinBlocks joins with the separator', () => {
    expect(BLOCK_SEPARATOR).toBe('\n\n');
    expect(joinBlocks(['a'])).toBe('a');
    expect(joinBlocks(['a', 'b'])).toBe('a\n\nb');
  });

  test('SceneBlocksBody enforces counts, length and unique ids, and keeps spaces', () => {
    const ok = (blocks: unknown[]) => SceneBlocksBody.safeParse({ revision: 0, blocks }).success;
    expect(ok([])).toBe(false);
    expect(ok(Array.from({ length: 201 }, () => ({ text: 'x' })))).toBe(false);
    expect(ok(Array.from({ length: 200 }, () => ({ text: 'x' })))).toBe(true);
    expect(ok([{ text: 'x'.repeat(10001) }])).toBe(false);
    expect(ok([{ id: id1, text: 'a' }, { id: id1, text: 'b' }])).toBe(false);
    expect(ok([{ id: id1, text: 'a' }, { id: id2, text: 'b' }, { text: 'c' }, { text: 'd' }])).toBe(true);
    expect(SceneBlocksBody.parse({ revision: 3, blocks: [{ text: '  hi  ' }] }).blocks[0]!.text).toBe('  hi  ');
    expect(SceneBlocksBody.safeParse({ revision: -1, blocks: [{ text: 'a' }] }).success).toBe(false);
  });

  test('assignment patch accepts an optional revision', () => {
    expect(SceneAssignmentPatchBody.parse({ description: 'x', revision: 2 })).toEqual({ description: 'x', revision: 2 });
  });
});
