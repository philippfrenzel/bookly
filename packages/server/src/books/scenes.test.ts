/** Integration tests for the scene, note, image, assignment and scene description endpoints. */
import { describe, expect, test } from 'vitest';
import { AiError, type AiClient, type AiRequest } from '../ai/client.js';
import { createFakeAiClient } from '../ai/fake.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedTimePoints } from '../test/fixtures.js';
import { matchesImageType } from './scenes.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

/** A user with one book, a main storyline and two sections; `ai` defaults to the fake client. */
async function setup(ai: AiClient | null = createFakeAiClient()) {
  const app = await testApp({ ai });
  const { cookie } = await registeredAgent(app);
  const created = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  const bookId: string = created.json().book.id;
  const tps = await seedTimePoints(app, bookId, ['T0', 'T1', 'T2', 'T3']);
  const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object) =>
    app.inject({ method, url: `/api/books/${bookId}${path}`, headers: { cookie }, ...(payload && { payload }) });
  const upload = (sceneId: string, body: Buffer, type: string) =>
    app.inject({ method: 'PUT', url: `/api/books/${bookId}/scenes/${sceneId}/image`, headers: { cookie, 'content-type': type }, payload: body });
  const line = await req('POST', '/storylines', { title: 'Reise', kind: 'main', range: { startId: tps[0], endId: tps[3] } });
  const storylineId: string = line.json().book.storylines[0].id;
  await req('POST', `/storylines/${storylineId}/sections`, { title: 'Ankunft', range: { startId: tps[0], endId: tps[1] } });
  const res = await req('POST', `/storylines/${storylineId}/sections`, { title: 'Abschied', range: { startId: tps[2], endId: tps[3] } });
  const [s1, s2] = res.json().book.storylines[0].sections.map((s: { id: string }) => s.id) as [string, string];
  const createScene = async (name = 'Bergsee') => {
    const r = await req('POST', '/scenes', { name });
    expect(r.statusCode).toBe(201);
    return (r.json().scenes as { id: string; name: string }[]).find((s) => s.name === name)!.id;
  };
  /** A side strand (no sections) in the same book. */
  const createSide = async (title = 'Erinnerung') =>
    ((await req('POST', '/storylines', { title, kind: 'side', range: { startId: tps[1], endId: tps[2] } })).json().book.storylines as { id: string; title: string }[]).find((l) => l.title === title)!.id;
  return { app, cookie, bookId, req, upload, s1, s2, storylineId, createScene, createSide };
}

describe('scenes (AC-001)', () => {
  test('create, rename and delete; scenes come with every book response', async () => {
    const { app, req, createScene } = await setup();
    const id = await createScene();
    const renamed = await req('PATCH', `/scenes/${id}`, { name: 'Alpensee' });
    expect(renamed.json().scenes).toEqual([{ id, name: 'Alpensee', image: null, notes: [] }]);
    expect((await req('GET', '')).json().scenes).toHaveLength(1);
    const deleted = await req('DELETE', `/scenes/${id}`);
    expect(deleted.json().scenes).toEqual([]);
    await app.close();
  });

  test('blank name is 400, foreign scene is 404', async () => {
    const { app, req, createScene } = await setup();
    expect((await req('POST', '/scenes', { name: '  ' })).statusCode).toBe(400);
    const id = await createScene();
    const other = await registeredAgent(app);
    const book2 = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie: other.cookie }, payload: { title: 'B' } });
    const res = await app.inject({
      method: 'PATCH', url: `/api/books/${book2.json().book.id}/scenes/${id}`, headers: { cookie: other.cookie }, payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('notes and image (AC-002)', () => {
  test('notes are added in order, changed and removed', async () => {
    const { app, req, createScene } = await setup();
    const id = await createScene();
    await req('POST', `/scenes/${id}/notes`, { text: 'Klarer See' });
    const two = await req('POST', `/scenes/${id}/notes`, { text: 'Nebel am Morgen' });
    const notes = two.json().scenes[0].notes as { id: string; text: string }[];
    expect(notes.map((n) => n.text)).toEqual(['Klarer See', 'Nebel am Morgen']);
    const changed = await req('PATCH', `/scenes/${id}/notes/${notes[0]!.id}`, { text: 'Klarer Bergsee' });
    expect(changed.json().scenes[0].notes[0].text).toBe('Klarer Bergsee');
    const removed = await req('DELETE', `/scenes/${id}/notes/${notes[1]!.id}`);
    expect(removed.json().scenes[0].notes).toEqual([{ id: notes[0]!.id, text: 'Klarer Bergsee' }]);
    await app.close();
  });

  test('note longer than 10000 characters is 400', async () => {
    const { app, req, createScene } = await setup();
    const id = await createScene();
    expect((await req('POST', `/scenes/${id}/notes`, { text: 'x'.repeat(10001) })).statusCode).toBe(400);
    await app.close();
  });

  test('image upload, replace, serve and remove', async () => {
    const { app, req, upload, cookie, bookId, createScene } = await setup();
    const id = await createScene();
    const first = await upload(id, PNG, 'image/png');
    expect(first.statusCode).toBe(200);
    expect(first.json().scenes[0].image).toMatchObject({ mime: 'image/png', size: PNG.length });
    const replaced = await upload(id, JPEG, 'image/jpeg');
    expect(replaced.json().scenes[0].image).toMatchObject({ mime: 'image/jpeg', size: JPEG.length });
    const served = await app.inject({ method: 'GET', url: `/api/books/${bookId}/scenes/${id}/image`, headers: { cookie } });
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.rawPayload.equals(JPEG)).toBe(true);
    const removed = await req('DELETE', `/scenes/${id}/image`);
    expect(removed.json().scenes[0].image).toBeNull();
    expect((await app.inject({ method: 'GET', url: `/api/books/${bookId}/scenes/${id}/image`, headers: { cookie } })).statusCode).toBe(404);
    await app.close();
  });

  test('wrong bytes, unsupported type and oversize images are refused', async () => {
    const { app, upload, createScene } = await setup();
    const id = await createScene();
    expect((await upload(id, JPEG, 'image/png')).statusCode).toBe(415);
    expect((await upload(id, PNG, 'image/gif')).statusCode).toBe(415);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    expect((await upload(id, big, 'image/png')).statusCode).toBe(413);
    await app.close();
  });

  test('matchesImageType recognises webp', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
    expect(matchesImageType('image/webp', webp)).toBe(true);
    expect(matchesImageType('image/webp', PNG)).toBe(false);
  });
});

describe('assignments (AC-003, AC-005)', () => {
  test('assign to several sections, change the description, remove', async () => {
    const { app, req, s1, s2, createScene } = await setup();
    const id = await createScene();
    const a = await req('POST', '/scene-assignments', { sceneId: id, sectionId: s1, description: 'Ein klarer See.' });
    expect(a.statusCode).toBe(201);
    const b = await req('POST', '/scene-assignments', { sceneId: id, sectionId: s2 });
    const list = b.json().sceneAssignments as { id: string; sectionId: string; description: string }[];
    expect(list.map((x) => [x.sectionId, x.description])).toEqual([[s1, 'Ein klarer See.'], [s2, '']]);
    const changed = await req('PATCH', `/scene-assignments/${list[1]!.id}`, { description: 'Nebel über dem See.' });
    expect(changed.json().sceneAssignments.at(-1).description).toBe('Nebel über dem See.');
    const removed = await req('DELETE', `/scene-assignments/${list[0]!.id}`);
    expect(removed.json().sceneAssignments.map((x: { sectionId: string }) => x.sectionId)).toEqual([s2]);
    await app.close();
  });

  test('the same scene twice in one section is 409', async () => {
    const { app, req, s1, createScene } = await setup();
    const id = await createScene();
    await req('POST', '/scene-assignments', { sceneId: id, sectionId: s1 });
    expect((await req('POST', '/scene-assignments', { sceneId: id, sectionId: s1 })).statusCode).toBe(409);
    await app.close();
  });

  test('deleting the section or the scene removes its assignments', async () => {
    const { app, req, s1, s2, createScene } = await setup();
    const id = await createScene();
    await req('POST', '/scene-assignments', { sceneId: id, sectionId: s1 });
    await req('POST', '/scene-assignments', { sceneId: id, sectionId: s2 });
    expect((await req('DELETE', `/sections/${s1}`)).json().sceneAssignments).toHaveLength(1);
    expect((await req('DELETE', `/scenes/${id}`)).json().sceneAssignments).toEqual([]);
    await app.close();
  });

  test('moving an assignment keeps its description; target with the same scene is 409', async () => {
    const { app, req, s1, s2, createScene } = await setup();
    const id = await createScene();
    const a = (await req('POST', '/scene-assignments', { sceneId: id, sectionId: s1, description: 'Ein klarer See.' })).json().sceneAssignments[0].id;
    const moved = await req('PATCH', `/scene-assignments/${a}`, { sectionId: s2 });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().sceneAssignments.map((x: { sectionId: string; description: string }) => [x.sectionId, x.description])).toEqual([[s2, 'Ein klarer See.']]);
    await req('POST', '/scene-assignments', { sceneId: id, sectionId: s1 });
    expect((await req('PATCH', `/scene-assignments/${a}`, { sectionId: s1 })).statusCode).toBe(409);
    expect((await req('PATCH', `/scene-assignments/${a}`, { sectionId: s2 })).statusCode).toBe(200);
    expect((await req('PATCH', `/scene-assignments/${a}`, { sectionId: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
    expect((await req('PATCH', `/scene-assignments/${a}`, {})).statusCode).toBe(400);
    await app.close();
  });

  test('a scene can be assigned to a whole storyline such as a side strand, and moved between targets', async () => {
    const { app, req, s1, createScene, createSide } = await setup();
    const id = await createScene();
    const side = await createSide();
    const res = await req('POST', '/scene-assignments', { sceneId: id, storylineId: side, description: 'Kindheitssee' });
    expect(res.statusCode).toBe(201);
    const [a] = res.json().sceneAssignments as { id: string; sectionId: string | null; storylineId: string | null }[];
    expect(a).toMatchObject({ sectionId: null, storylineId: side });
    expect((await req('POST', '/scene-assignments', { sceneId: id, storylineId: side })).statusCode).toBe(409);
    expect((await req('POST', '/scene-assignments', { sceneId: id })).statusCode).toBe(400);
    const toSection = await req('PATCH', `/scene-assignments/${a!.id}`, { sectionId: s1 });
    expect(toSection.json().sceneAssignments[0]).toMatchObject({ sectionId: s1, storylineId: null, description: 'Kindheitssee' });
    const back = await req('PATCH', `/scene-assignments/${a!.id}`, { storylineId: side });
    expect(back.json().sceneAssignments[0]).toMatchObject({ sectionId: null, storylineId: side });
    expect((await req('DELETE', `/storylines/${side}`)).json().sceneAssignments).toEqual([]);
    await app.close();
  });

  test('unknown storyline is 404', async () => {
    const { app, req, createScene } = await setup();
    const id = await createScene();
    expect((await req('POST', '/scene-assignments', { sceneId: id, storylineId: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
    await app.close();
  });

  test('unknown section is 404', async () => {
    const { app, req, createScene } = await setup();
    const id = await createScene();
    const res = await req('POST', '/scene-assignments', { sceneId: id, sectionId: '00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('scene description (FR-004, AC-004, AC-008, EC-001..003)', () => {
  /** A stub AI client that records each request. */
  function recording(answer: unknown = { description: 'Ein klarer See in den Alpen.' }) {
    const calls: AiRequest[] = [];
    const client: AiClient = { model: 'stub/model', complete: async (r) => { calls.push(r); return answer; } };
    return { client, calls };
  }

  test('image and notes both reach the model, with the section as context', async () => {
    const { client, calls } = recording();
    const { app, req, upload, s1, createScene } = await setup(client);
    const id = await createScene();
    await req('POST', `/scenes/${id}/notes`, { text: 'Leichter Nebel, wo die Morgensonne auftrifft' });
    await upload(id, PNG, 'image/png');
    const res = await req('POST', `/scenes/${id}/description`, { sectionId: s1 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ description: 'Ein klarer See in den Alpen.' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.images).toEqual([{ mime: 'image/png', data: PNG }]);
    const user = JSON.parse(calls[0]!.user);
    expect(user.notizen).toEqual(['Leichter Nebel, wo die Morgensonne auftrifft']);
    expect(user.abschnitt).toMatchObject({ titel: 'Ankunft', storyline: 'Reise' });
    await app.close();
  });

  test('a storyline target is sent as context; a sample asks for a prose passage', async () => {
    const { client, calls } = recording();
    const { app, req, createScene, createSide } = await setup(client);
    const id = await createScene();
    await req('POST', `/scenes/${id}/notes`, { text: 'Nebel' });
    const side = await createSide();
    await req('POST', `/scenes/${id}/description`, { storylineId: side });
    expect(JSON.parse(calls[0]!.user).storyline).toMatchObject({ titel: 'Erinnerung', art: 'Nebenstrang' });
    expect(calls[0]!.system).toContain('2 bis 5 Sätze');
    const sample = await req('POST', `/scenes/${id}/description`, { kind: 'sample' });
    expect(sample.statusCode).toBe(200);
    expect(calls[1]!.system).toContain('Beispielpassage');
    expect(JSON.parse(calls[1]!.user).notizen).toEqual(['Nebel']);
    await app.close();
  });

  test('notes only: no image sent (EC-001); image only: no notes (EC-002)', async () => {
    const { client, calls } = recording();
    const { app, req, upload, createScene } = await setup(client);
    const withNotes = await createScene('A');
    await req('POST', `/scenes/${withNotes}/notes`, { text: 'Notiz' });
    await req('POST', `/scenes/${withNotes}/description`, {});
    const withImage = await createScene('B');
    await upload(withImage, PNG, 'image/png');
    await req('POST', `/scenes/${withImage}/description`, {});
    expect(calls[0]!.images).toBeUndefined();
    expect(calls[1]!.images).toHaveLength(1);
    expect(JSON.parse(calls[1]!.user).notizen).toEqual([]);
    await app.close();
  });

  test('neither image nor notes: 400 empty_context, no model call (EC-003)', async () => {
    const { client, calls } = recording();
    const { app, req, createScene } = await setup(client);
    const id = await createScene();
    await req('POST', `/scenes/${id}/notes`, { text: '' });
    const res = await req('POST', `/scenes/${id}/description`, {});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'empty_context' });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  test('AI off is 503, AI failure is 502', async () => {
    const off = await setup(null);
    const id = await off.createScene();
    expect((await off.req('POST', `/scenes/${id}/description`, {})).statusCode).toBe(503);
    await off.app.close();
    const failing: AiClient = { model: 'x', complete: async () => { throw new AiError('boom'); } };
    const bad = await setup(failing);
    const id2 = await bad.createScene();
    await bad.req('POST', `/scenes/${id2}/notes`, { text: 'Notiz' });
    expect((await bad.req('POST', `/scenes/${id2}/description`, {})).statusCode).toBe(502);
    await bad.app.close();
  });
});
