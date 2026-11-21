/** Integration tests for check enqueueing on save and the AI check, ack and AI text routes. */
import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AiError, type AiClient, type AiRequest } from '../ai/client.js';
import { createFakeAiClient } from '../ai/fake.js';
import { createCheckWorker } from '../ai/worker.js';
import { characterChecks, sectionCharacters, sections } from '../db/schema.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedStoryline, seedTimePoints } from '../test/fixtures.js';

/** Sets up a book with time points and a character; storylines are created per test. */
async function setup(ai: AiClient | null = createFakeAiClient()) {
  const app = await testApp({ ai });
  const { cookie } = await registeredAgent(app);
  const created = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  const bookId: string = created.json().book.id;
  const tps = await seedTimePoints(app, bookId);
  const charId = await seedCharacter(app, bookId, 'Anna');
  const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object, book = bookId) =>
    app.inject({ method, url: `/api/books/${book}${path}`, headers: { cookie }, ...(payload && { payload }) });
  const createStoryline = async (description = 'Anna reist ab.', characterIds = [charId]) => {
    const res = await req('POST', '/storylines', {
      title: 'Strang', description, kind: 'main', characterIds, range: { startId: tps[0], endId: tps[2] },
    });
    expect(res.statusCode).toBe(201);
    return res.json().book.storylines[0].id as string;
  };
  const runWorker = () => createCheckWorker({ db: app.db, ai: ai!, log: app.log, quietMs: 0 }).runOnce();
  return { app, cookie, bookId, tps, charId, req, createStoryline, runWorker, created };
}

describe('enqueue on save', () => {
  test('saving a storyline with a character returns a pending check', async () => {
    const { app, req, charId, tps } = await setup();
    const res = await req('POST', '/storylines', {
      title: 'Strang', kind: 'main', characterIds: [charId], range: { startId: tps[0], endId: tps[2] },
    });
    const body = res.json();
    expect(body.ai).toEqual({ enabled: true });
    expect(body.characterChecks).toEqual([
      { storylineId: body.book.storylines[0].id, status: 'pending', finishedAt: null, error: null },
    ]);
    await app.close();
  });

  test('saving an unrelated book title does not re-enqueue unchanged storylines', async () => {
    const { app, req, createStoryline, runWorker } = await setup();
    const id = await createStoryline();
    expect(await runWorker()).toBe(1);
    const res = await req('PATCH', '', { title: 'Neuer Titel' });
    expect(res.json().characterChecks).toEqual([expect.objectContaining({ storylineId: id, status: 'done' })]);
    await app.close();
  });

  test('a storyline without characters gets no check', async () => {
    const { app, req, tps } = await setup();
    const res = await req('POST', '/storylines', { title: 'Leer', kind: 'main', range: { startId: tps[0], endId: tps[2] } });
    expect(res.json().characterChecks).toEqual([]);
    await app.close();
  });

  test('an enqueue failure does not fail the save', async () => {
    const { app, req, tps, charId } = await setup({ get model(): string { throw new Error('boom'); }, complete: async () => ({}) });
    const res = await req('POST', '/storylines', {
      title: 'Strang', kind: 'main', characterIds: [charId], range: { startId: tps[0], endId: tps[2] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().book.storylines).toHaveLength(1);
    await app.close();
  });

  test('GET and POST /api/books report ai.enabled', async () => {
    const { app, req, created } = await setup();
    expect(created.json().ai).toEqual({ enabled: true });
    expect((await req('GET', '')).json().ai).toEqual({ enabled: true });
    await app.close();
  });
});

describe('forced checks', () => {
  test('forces one storyline check even when nothing changed', async () => {
    const { app, req, createStoryline, runWorker } = await setup();
    const id = await createStoryline();
    await runWorker();
    const res = await req('POST', `/storylines/${id}/character-check`);
    expect(res.statusCode).toBe(200);
    expect(res.json().characterChecks).toEqual([expect.objectContaining({ storylineId: id, status: 'pending' })]);
    await app.close();
  });

  test('forces all storylines with input', async () => {
    const { app, req, createStoryline, runWorker } = await setup();
    const withChars = await createStoryline();
    await createStoryline('ohne Figuren', []);
    await runWorker();
    const res = await req('POST', '/character-checks');
    expect(res.statusCode).toBe(200);
    expect(res.json().characterChecks).toEqual([expect.objectContaining({ storylineId: withChars, status: 'pending' })]);
    await app.close();
  });

  test('404 for a foreign storyline or book', async () => {
    const { app, req, createStoryline } = await setup();
    const id = await createStoryline();
    const other = (await app.inject({
      method: 'POST', url: '/api/books', headers: { cookie: (await registeredAgent(app)).cookie }, payload: { title: 'X' },
    })).json().book.id;
    expect((await req('POST', `/storylines/${id}/character-check`, undefined, other)).statusCode).toBe(404);
    expect((await req('POST', '/character-checks', undefined, other)).statusCode).toBe(404);
    expect((await req('POST', `/storylines/00000000-0000-4000-8000-000000000000/character-check`)).statusCode).toBe(404);
    await app.close();
  });
});

describe('warning acknowledgements', () => {
  test('an ack mutes a later warning of the same key; DELETE undoes it', async () => {
    const { app, req, createStoryline, runWorker, charId } = await setup();
    const id = await createStoryline('FAKE-WIDERSPRUCH');
    await runWorker();
    const first = (await req('GET', '')).json().characterWarnings;
    expect(first).toEqual([expect.objectContaining({ characterId: charId, criterion: 'behavior_change', acknowledged: false })]);
    const ack = { storylineId: id, characterId: charId, criterion: 'behavior_change' };
    const acked = await req('POST', '/character-warning-acks', ack);
    expect(acked.statusCode).toBe(200);
    expect(acked.json().characterWarnings[0].acknowledged).toBe(true);
    await req('POST', `/storylines/${id}/character-check`);
    await runWorker();
    const later = (await req('GET', '')).json().characterWarnings;
    expect(later).toHaveLength(1);
    expect(later[0].id).not.toBe(first[0].id);
    expect(later[0].acknowledged).toBe(true);
    const undone = await req('DELETE', '/character-warning-acks', ack);
    expect(undone.statusCode).toBe(200);
    expect(undone.json().characterWarnings[0].acknowledged).toBe(false);
    await app.close();
  });

  test('accepts a character linked only through a section', async () => {
    const { app, req, createStoryline, bookId, tps } = await setup();
    const id = await createStoryline('x', []);
    const ben = await seedCharacter(app, bookId, 'Ben');
    const [sec] = await app.db.insert(sections)
      .values({ storylineId: id, title: 'A', startId: tps[0]!, endId: tps[1]!, order: 0 }).returning({ id: sections.id });
    await app.db.insert(sectionCharacters).values({ sectionId: sec!.id, characterId: ben });
    const res = await req('POST', '/character-warning-acks', { storylineId: id, characterId: ben, criterion: 'intention_conflict' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  test('400 not_linked for an unlinked character', async () => {
    const { app, req, createStoryline, bookId } = await setup();
    const id = await createStoryline();
    const ben = await seedCharacter(app, bookId, 'Ben');
    const res = await req('POST', '/character-warning-acks', { storylineId: id, characterId: ben, criterion: 'behavior_change' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'not_linked' });
    await app.close();
  });

  test('404 for ids of another book', async () => {
    const { app, req, cookie, createStoryline, charId } = await setup();
    const id = await createStoryline();
    const other = (await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'X' } })).json().book.id;
    const res = await req('POST', '/character-warning-acks', { storylineId: id, characterId: charId, criterion: 'behavior_change' }, other);
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('ai text', () => {
  const fakeSuggestions = ['KI-Vorschlag 1', 'KI-Vorschlag 2', 'KI-Vorschlag 3'];
  const descTarget = (storylineId: string | null) => ({ kind: 'storyline', storylineId, field: 'description' });

  test('returns three fake suggestions for a storyline description', async () => {
    const { app, req, createStoryline } = await setup();
    const id = await createStoryline('Die Reise');
    const res = await req('POST', '/ai/text', { target: descTarget(id), action: 'rephrase', text: 'Die Reise beginnt.', selection: null });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ suggestions: fakeSuggestions });
    await app.close();
  });

  test('generate on an empty new storyline returns 400 empty_context', async () => {
    const { app, req } = await setup();
    const res = await req('POST', '/ai/text', { target: descTarget(null), action: 'generate', text: '', selection: null, draft: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'empty_context' });
    await app.close();
  });

  test('invalid selection returns 400 invalid_body', async () => {
    const { app, req, createStoryline } = await setup();
    const id = await createStoryline();
    const res = await req('POST', '/ai/text', { target: descTarget(id), action: 'rephrase', text: 'Kurz', selection: { start: 0, end: 99 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    await app.close();
  });

  test('foreign storyline id returns 404', async () => {
    const { app, req, cookie, createStoryline } = await setup();
    const id = await createStoryline();
    const other = (await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'X' } })).json().book.id;
    const res = await req('POST', '/ai/text', { target: descTarget(id), action: 'rephrase', text: 'Text hier', selection: null }, other);
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  test('ai failure returns 502 ai_failed', async () => {
    const ai: AiClient = { model: 'm', complete: async () => { throw new AiError('AI request timed out'); } };
    const { app, req, createStoryline } = await setup(ai);
    const id = await createStoryline();
    const res = await req('POST', '/ai/text', { target: descTarget(id), action: 'rephrase', text: 'Text hier', selection: null });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'ai_failed' });
    await app.close();
  });

  test('addition for an unlinked character returns 404', async () => {
    const { app, req, bookId, createStoryline } = await setup();
    const id = await createStoryline();
    const ben = await seedCharacter(app, bookId, 'Ben');
    const res = await req('POST', '/ai/text', {
      target: { kind: 'addition', storylineId: id, characterId: ben, field: 'behavior' },
      action: 'rephrase', text: 'Text hier', selection: null,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('ai text for scene blocks', () => {
  /** A fake client that records every request. */
  const spyAi = () => {
    const fake = createFakeAiClient();
    const calls: AiRequest[] = [];
    const ai: AiClient = { model: 'spy', complete: async (r) => { calls.push(r); return fake.complete(r); } };
    return { ai, calls };
  };

  /** A storyline with a section, a scene assigned to it and blocks ['Davor', '', 'Danach']. */
  async function sceneSetup(ai: AiClient) {
    const s = await setup(ai);
    const storylineId = await s.createStoryline();
    const sec = await s.req('POST', `/storylines/${storylineId}/sections`, {
      title: 'Ankunft', characterIds: [s.charId], range: { startId: s.tps[0], endId: s.tps[1] },
    });
    const sectionId: string = sec.json().book.storylines[0].sections[0].id;
    const sceneId: string = (await s.req('POST', '/scenes', { name: 'Bergsee' })).json().scenes[0].id;
    const created = await s.req('POST', '/scene-assignments', { sceneId, sectionId, description: '' });
    const a = created.json().sceneAssignments[0] as { id: string; revision: number };
    const put = await s.req('PUT', `/scene-assignments/${a.id}/blocks`, {
      revision: a.revision, blocks: [{ text: 'Davor' }, { text: '' }, { text: 'Danach' }],
    });
    const blockIds = (put.json().sceneAssignments[0].blocks as { id: string }[]).map((b) => b.id);
    const target = (blockId = blockIds[1]!, assignmentId = a.id) => ({ kind: 'sceneBlock', assignmentId, blockId, field: 'text' });
    return { ...s, assignmentId: a.id, blockIds, target };
  }

  test('generate on an empty block returns three suggestions with scoped context', async () => {
    const { ai, calls } = spyAi();
    const { app, req, target } = await sceneSetup(ai);
    const res = await req('POST', '/ai/text', { target: target(), action: 'generate', text: '', selection: null, length: 'short' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ suggestions: ['KI-Vorschlag 1', 'KI-Vorschlag 2', 'KI-Vorschlag 3'] });
    expect(calls).toHaveLength(1);
    const kontext = JSON.parse(calls[0]!.user).kontext;
    expect(kontext).toMatchObject({ textDavor: 'Davor', textDanach: 'Danach', figuren: [{ name: 'Anna' }] });
    expect(calls[0]!.system).toContain('Bearbeite nur diesen Block');
    expect(calls[0]!.system).toContain('Umfang: Etwa 150 bis 300 Wörter.');
    await app.close();
  });

  test('foreign or mismatched ids return 404 without calling the AI', async () => {
    const { ai, calls } = spyAi();
    const { app, req, cookie, target, blockIds } = await sceneSetup(ai);
    const other: string = (await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'X' } })).json().book.id;
    const unknown = '00000000-0000-4000-8000-000000000099';
    for (const [t, book] of [
      [target(), other],
      [target(unknown), undefined],
      [target(blockIds[0], unknown), undefined],
    ] as const) {
      const res = await req('POST', '/ai/text', { target: t, action: 'rephrase', text: 'Text hier', selection: null }, book);
      expect(res.statusCode).toBe(404);
    }
    expect(calls).toHaveLength(0);
    await app.close();
  });

  test('ai failure returns 502 ai_failed', async () => {
    const ai: AiClient = { model: 'm', complete: async () => { throw new AiError('AI request timed out'); } };
    const { app, req, target } = await sceneSetup(ai);
    const res = await req('POST', '/ai/text', { target: target(), action: 'generate', text: '', selection: null });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: 'ai_failed' });
    await app.close();
  });
});

describe('AI off', () => {
  test('503 ai_disabled for all three AI routes, ai.enabled false, saves create no checks', async () => {
    const { app, req, createStoryline, created } = await setup(null);
    expect(created.json().ai).toEqual({ enabled: false });
    const id = await createStoryline();
    const get = (await req('GET', '')).json();
    expect(get.ai).toEqual({ enabled: false });
    expect(get.characterChecks).toEqual([]);
    expect(await app.db.select().from(characterChecks)).toEqual([]);
    for (const path of [
      `/storylines/${id}/character-check`,
      '/character-checks',
      '/ai/text',
    ]) {
      const res = await req('POST', path, path === '/ai/text'
        ? { target: { kind: 'storyline', storylineId: id, field: 'description' }, action: 'rephrase', text: 'Text hier', selection: null }
        : {});
      expect(res.statusCode, path).toBe(503);
      expect(res.json()).toEqual({ error: 'ai_disabled' });
    }
    await app.close();
  });

  test('acks still work with AI off', async () => {
    const { app, req, createStoryline, charId } = await setup(null);
    const id = await createStoryline();
    const res = await req('POST', '/character-warning-acks', { storylineId: id, characterId: charId, criterion: 'behavior_change' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
