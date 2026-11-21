/** Tests for the scene bodies and pure scene rules. */
import { describe, expect, test } from 'vitest';
import { hasSceneContext, previousDescriptions, SceneAssignmentCreateBody, SceneAssignmentPatchBody, SceneBody, SceneNoteBody, parseTargetKey, targetKey, type SceneAssignment } from './scenes.js';

const a = (id: string, sceneId: string, description: string, updatedAt: string): SceneAssignment =>
  ({ id, sceneId, sectionId: `sec-${id}`, storylineId: null, description, updatedAt });

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

  test('assignment description defaults to empty and is limited to 2000', () => {
    const ids = { sceneId: '11111111-1111-4111-8111-111111111111', sectionId: '22222222-2222-4222-8222-222222222222' };
    expect(SceneAssignmentCreateBody.parse(ids).description).toBe('');
    expect(SceneAssignmentCreateBody.safeParse({ ...ids, description: 'x'.repeat(2001) }).success).toBe(false);
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
