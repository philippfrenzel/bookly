/** Integration tests for the scoped AI context of one scene block and its text request. */
import { describe, expect, test } from 'vitest';
import type { AiTextBody, SceneAssignment } from '@bookly/shared';
import { NotFoundError } from '../errors.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedTimePoints } from '../test/fixtures.js';
import { loadSceneBlockContext, sceneBlockRequest } from './sceneBlockContext.js';

/**
 * A book with figures Anna (storyline only), Ben (section) and Cora (side strand), a main storyline with one
 * section, a side strand and a scene with notes assigned to both targets.
 */
async function setup() {
  const app = await testApp();
  const { cookie } = await registeredAgent(app);
  const created = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  const bookId: string = created.json().book.id;
  const tps = await seedTimePoints(app, bookId, ['T0', 'T1', 'T2']);
  const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, payload?: object, book = bookId) =>
    app.inject({ method, url: `/api/books/${book}${path}`, headers: { cookie }, ...(payload && { payload }) });
  const anna = await seedCharacter(app, bookId, 'Anna');
  const ben = await seedCharacter(app, bookId, 'Ben');
  const cora = await seedCharacter(app, bookId, 'Cora');
  const line = await req('POST', '/storylines', {
    title: 'Reise', description: 'Die große Reise', kind: 'main', characterIds: [anna, ben], range: { startId: tps[0], endId: tps[2] },
  });
  const storylineId: string = line.json().book.storylines[0].id;
  const sec = await req('POST', `/storylines/${storylineId}/sections`, {
    title: 'Ankunft', description: 'Ben kommt an', characterIds: [ben], range: { startId: tps[0], endId: tps[1] },
  });
  expect(sec.statusCode).toBe(201);
  const sectionId: string = sec.json().book.storylines[0].sections[0].id;
  const side = await req('POST', '/storylines', {
    title: 'Erinnerung', description: 'Coras Rückblick', kind: 'side', characterIds: [cora], range: { startId: tps[1], endId: tps[2] },
  });
  const sideId: string = (side.json().book.storylines as { id: string; title: string }[]).find((l) => l.title === 'Erinnerung')!.id;
  const sceneId: string = (await req('POST', '/scenes', { name: 'Bergsee' })).json().scenes[0].id;
  await req('POST', `/scenes/${sceneId}/notes`, { text: 'Nebel über dem Wasser' });
  /** Assigns the scene and stores the given blocks; returns the assignment with block ids. */
  const assign = async (target: { sectionId: string } | { storylineId: string }, texts: string[]) => {
    const res = await req('POST', '/scene-assignments', { sceneId, ...target, description: '' });
    expect(res.statusCode).toBe(201);
    const key = 'sectionId' in target ? 'sectionId' : 'storylineId';
    const value = 'sectionId' in target ? target.sectionId : target.storylineId;
    const a = (res.json().sceneAssignments as SceneAssignment[]).find((x) => x[key] === value)!;
    const put = await req('PUT', `/scene-assignments/${a.id}/blocks`, { revision: a.revision, blocks: texts.map((text) => ({ text })) });
    expect(put.statusCode).toBe(200);
    return (put.json().sceneAssignments as SceneAssignment[]).find((x) => x.id === a.id)!;
  };
  return { app, req, cookie, bookId, sectionId, sideId, assign };
}

describe('loadSceneBlockContext', () => {
  test('section target: section figures only, neighbour text around the current block', async () => {
    const { app, bookId, sectionId, assign } = await setup();
    const a = await assign({ sectionId }, ['Davor eins', 'Davor zwei', 'AKTUELL', 'Danach']);
    const ctx = await loadSceneBlockContext(app.db, bookId, a.id, a.blocks[2]!.id);
    expect(ctx.fieldLabel).toBe('Szenentext');
    expect(ctx.hasText).toBe(true);
    expect(ctx.context).toMatchObject({
      buch: 'Roman',
      szene: { name: 'Bergsee', notizen: 'Nebel über dem Wasser' },
      ort: { art: 'Abschnitt', titel: 'Ankunft', beschreibung: 'Ben kommt an', storyline: 'Reise' },
      figuren: [{ name: 'Ben', beschreibung: '' }],
      textDavor: 'Davor eins\n\nDavor zwei',
      textDanach: 'Danach',
    });
    expect(JSON.stringify(ctx.context)).not.toContain('AKTUELL');
    await app.close();
  });

  test('storyline target: storyline figures; surrounding text is cut to 3000 / 1500 characters', async () => {
    const { app, bookId, sideId, assign } = await setup();
    const a = await assign({ storylineId: sideId }, ['a'.repeat(4000), '', 'z'.repeat(2000)]);
    const ctx = await loadSceneBlockContext(app.db, bookId, a.id, a.blocks[1]!.id);
    expect(ctx.context).toMatchObject({
      ort: { art: 'Storyline', titel: 'Erinnerung', beschreibung: 'Coras Rückblick', storyline: 'Erinnerung' },
      figuren: [{ name: 'Cora', beschreibung: '' }],
    });
    expect(ctx.context.textDavor).toHaveLength(3000);
    expect(ctx.context.textDanach).toHaveLength(1500);
    await app.close();
  });

  test('the loaded context carries the book range but no length text of its own', async () => {
    const { app, req, bookId, sectionId, assign } = await setup();
    await req('PATCH', '', { targetWords: { min: 60000, max: 90000 } });
    const a = await assign({ sectionId }, ['']);
    const ctx = await loadSceneBlockContext(app.db, bookId, a.id, a.blocks[0]!.id);
    expect(ctx.targetWords).toEqual({ min: 60000, max: 90000 });
    expect(ctx.context.zielumfang).toBeUndefined();
    await app.close();
  });

  test('a block of another assignment or an assignment of another book is not found', async () => {
    const { app, cookie, bookId, sectionId, sideId, assign } = await setup();
    const a = await assign({ sectionId }, ['x']);
    const b = await assign({ storylineId: sideId }, ['y']);
    await expect(loadSceneBlockContext(app.db, bookId, a.id, b.blocks[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(loadSceneBlockContext(app.db, bookId, a.id, 'kein-uuid')).rejects.toBeInstanceOf(NotFoundError);
    const otherBook: string = (await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'X' } })).json().book.id;
    await expect(loadSceneBlockContext(app.db, otherBook, a.id, a.blocks[0]!.id)).rejects.toBeInstanceOf(NotFoundError);
    await app.close();
  });
});

describe('sceneBlockRequest', () => {
  const body = (action: AiTextBody['action'], length?: AiTextBody['length']): AiTextBody => ({
    target: { kind: 'sceneBlock', assignmentId: 'a', blockId: 'b', field: 'text' },
    action, text: '', selection: null, draft: {}, ...(length && { length }),
  } as AiTextBody);
  const ctx = (targetWords: { min: number; max: number } | null) => ({
    fieldLabel: 'Szenentext' as const, context: {}, hasText: true as const, targetWords,
  });

  const OVERRIDE = 'Abweichend von den Längenangaben oben („1–3 Sätze“) gilt für diesen Block: Umfang:';
  const kontext = (r: { user: string }) => JSON.parse(r.user).kontext as Record<string, unknown>;

  test.each(['generate', 'continue'] as const)('%s: the length line explicitly overrides "1–3 Sätze"', (action) => {
    const r = sceneBlockRequest(ctx(null), body(action));
    expect(r.system).toContain(`${OVERRIDE} ein bis drei Absätze`);
    expect(r.system.indexOf(OVERRIDE)).toBeGreaterThan(r.system.lastIndexOf('1–3 Sätze,'));
  });

  test('zielumfang comes from body.length and matches the system line; only for generate and continue', () => {
    const r = sceneBlockRequest(ctx({ min: 60000, max: 90000 }), body('generate', 'short'));
    expect(kontext(r).zielumfang).toContain('60000–90000');
    expect(kontext(r).zielumfang).toContain('Schreibe eher knapp.');
    expect(r.system).toContain(`Umfang: ${kontext(r).zielumfang as string}`);
    for (const action of ['rephrase', 'polish'] as const) {
      expect(kontext(sceneBlockRequest(ctx({ min: 60000, max: 90000 }), body(action, 'short'))).zielumfang).toBeUndefined();
    }
  });

  test('adds the block rule and, for generate/continue, the length line', () => {
    const gen = sceneBlockRequest(ctx(null), body('generate'));
    expect(gen.schemaName).toBe('text_suggestions');
    expect(gen.system).toContain('Der Text ist ein Block eines Szenentextes (Prosa). Bearbeite nur diesen Block; textDavor und textDanach sind Umgebung und werden nie wiederholt oder verändert.');
    expect(gen.system).toContain('Umfang: ein bis drei Absätze');
    expect(sceneBlockRequest(ctx({ min: 60000, max: 90000 }), body('continue', 'long')).system).toContain('Umfang: Das ganze Buch soll insgesamt etwa 60000–90000 Wörter umfassen.');
    const polish = sceneBlockRequest(ctx(null), body('polish'));
    expect(polish.system).toContain('Bearbeite nur diesen Block');
    expect(polish.system).not.toContain('Umfang:');
  });
});
