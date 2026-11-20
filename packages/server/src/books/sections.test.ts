/** Integration tests for the section endpoints. */
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedTimePoints } from '../test/fixtures.js';

/** Creates a book through the API and returns its id. */
async function createBook(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  return res.json().book.id;
}

/** Sets up a user, a book, four time points and one main storyline spanning all of them. */
async function setup() {
  const app = await testApp();
  const { cookie } = await registeredAgent(app);
  const bookId = await createBook(app, cookie);
  const tps = await seedTimePoints(app, bookId, ['Tag 1', 'Tag 2', 'Tag 3', 'Tag 4']);
  const base = `/api/books/${bookId}`;
  const req = (method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url: base + url, headers: { cookie }, payload: payload as object | undefined });
  const sl = await req('POST', '/storylines', { title: 'S', range: { startId: tps[0], endId: tps[3] }, kind: 'main' });
  const storylineId: string = sl.json().book.storylines[0].id;
  return { app, cookie, bookId, tps, base, req, storylineId };
}

describe('sections', () => {
  test('create appends with increasing order and stores characters', async () => {
    const { app, bookId, tps, req, storylineId } = await setup();
    const c = await seedCharacter(app, bookId);
    const first = await req('POST', `/storylines/${storylineId}/sections`, {
      title: 'A', range: { startId: tps[0], endId: tps[1] }, characterIds: [c],
    });
    expect(first.statusCode).toBe(201);
    const second = await req('POST', `/storylines/${storylineId}/sections`, { title: 'B', range: { startId: tps[2], endId: tps[3] } });
    const secs = second.json().book.storylines[0].sections;
    expect(secs.map((s: { title: string; order: number }) => [s.title, s.order])).toEqual([['A', 0], ['B', 1]]);
    expect(secs[0].characterIds).toEqual([c]);
    await app.close();
  });

  test('concurrent creates are serialized: distinct orders, overlap still rejected', async () => {
    const { app, cookie, base, tps, req, storylineId } = await setup();
    const results = await Promise.all([
      req('POST', `/storylines/${storylineId}/sections`, { title: 'A', range: { startId: tps[0], endId: tps[1] } }),
      req('POST', `/storylines/${storylineId}/sections`, { title: 'B', range: { startId: tps[2], endId: tps[3] } }),
      req('POST', `/storylines/${storylineId}/sections`, { title: 'C', range: { startId: tps[0], endId: tps[1] } }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 201, 422]);
    const book = await app.inject({ method: 'GET', url: base, headers: { cookie } });
    const orders = book.json().book.storylines[0].sections.map((x: { order: number }) => x.order).sort();
    expect(orders).toEqual([0, 1]);
    await app.close();
  });

  test('overlap and unknown references are 422', async () => {
    const { app, tps, req, storylineId } = await setup();
    await req('POST', `/storylines/${storylineId}/sections`, { title: 'A', range: { startId: tps[0], endId: tps[2] } });
    const overlap = await req('POST', `/storylines/${storylineId}/sections`, { title: 'B', range: { startId: tps[1], endId: tps[3] } });
    expect(overlap.statusCode).toBe(422);
    expect(overlap.json().issues[0].code).toBe('sections_overlap');
    const unknownTp = await req('POST', `/storylines/${storylineId}/sections`, { title: 'B', range: { startId: randomUUID(), endId: tps[3] } });
    expect(unknownTp.statusCode).toBe(422);
    expect(unknownTp.json().issues[0].code).toBe('unknown_time_point');
    const other = await registeredAgent(app);
    const foreign = await seedCharacter(app, await createBook(app, other.cookie));
    const unknownChar = await req('POST', `/storylines/${storylineId}/sections`, {
      title: 'B', range: { startId: tps[2], endId: tps[3] }, characterIds: [foreign],
    });
    expect(unknownChar.statusCode).toBe(422);
    expect(unknownChar.json().issues[0].code).toBe('unknown_character');
    await app.close();
  });

  test('patch and delete a section', async () => {
    const { app, tps, req, storylineId } = await setup();
    const created = await req('POST', `/storylines/${storylineId}/sections`, { title: 'A', range: { startId: tps[0], endId: tps[1] } });
    const id = created.json().book.storylines[0].sections[0].id;
    const patched = await req('PATCH', `/sections/${id}`, { title: 'Neu', range: { startId: tps[1], endId: tps[2] } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().book.storylines[0].sections[0]).toMatchObject({ title: 'Neu', range: { startId: tps[1], endId: tps[2] } });
    const bad = await req('PATCH', `/sections/${id}`, { range: { startId: tps[2], endId: tps[0] } });
    expect(bad.statusCode).toBe(422);
    const del = await req('DELETE', `/sections/${id}`);
    expect(del.statusCode).toBe(200);
    expect(del.json().book.storylines[0].sections).toEqual([]);
    await app.close();
  });

  test('section of another book or malformed id is 404', async () => {
    const { app, cookie, base, tps } = await setup();
    const other = await registeredAgent(app);
    const ob = await createBook(app, other.cookie);
    const otherTps = await seedTimePoints(app, ob, ['a', 'b']);
    const range = { startId: otherTps[0], endId: otherTps[1] };
    const sl = await app.inject({
      method: 'POST', url: `/api/books/${ob}/storylines`, headers: { cookie: other.cookie },
      payload: { title: 'F', range, kind: 'main' },
    });
    const foreignStoryline = sl.json().book.storylines[0].id;
    const sec = await app.inject({
      method: 'POST', url: `/api/books/${ob}/storylines/${foreignStoryline}/sections`, headers: { cookie: other.cookie },
      payload: { title: 'F', range },
    });
    const foreignSection = sec.json().book.storylines[0].sections[0].id;
    const patch = await app.inject({ method: 'PATCH', url: `${base}/sections/${foreignSection}`, headers: { cookie }, payload: { title: 'x' } });
    expect(patch.statusCode).toBe(404);
    for (const id of ['nope', randomUUID()]) {
      expect((await app.inject({ method: 'DELETE', url: `${base}/sections/${id}`, headers: { cookie } })).statusCode).toBe(404);
    }
    const create = await app.inject({
      method: 'POST', url: `${base}/storylines/${foreignStoryline}/sections`, headers: { cookie },
      payload: { title: 'x', range: { startId: tps[0], endId: tps[1] } },
    });
    expect(create.statusCode).toBe(404);
    await app.close();
  });

  test('reorder must be an exact permutation of the strand sections', async () => {
    const { app, tps, req, storylineId } = await setup();
    await req('POST', `/storylines/${storylineId}/sections`, { title: 'A', range: { startId: tps[0], endId: tps[1] } });
    const two = await req('POST', `/storylines/${storylineId}/sections`, { title: 'B', range: { startId: tps[2], endId: tps[3] } });
    const [a, b] = two.json().book.storylines[0].sections.map((s: { id: string }) => s.id);
    const ok = await req('PUT', `/storylines/${storylineId}/sections/order`, { ids: [b, a] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().book.storylines[0].sections.map((s: { title: string }) => s.title)).toEqual(['B', 'A']);
    for (const ids of [[a], [a, a], [a, b, randomUUID()], [a, randomUUID()]]) {
      const bad = await req('PUT', `/storylines/${storylineId}/sections/order`, { ids });
      expect([ids.length, bad.statusCode, bad.json()]).toEqual([ids.length, 400, { error: 'invalid_order' }]);
    }
    await app.close();
  });
});
