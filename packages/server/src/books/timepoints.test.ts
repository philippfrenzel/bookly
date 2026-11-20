/** Integration tests for the time point endpoints. */
import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedStoryline, seedTimePoints } from '../test/fixtures.js';

/** Creates a book through the API and returns its id. */
async function createBook(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  return res.json().book.id;
}

const names = (res: { json(): { book: { timePoints: Array<{ name: string }> } } }) =>
  res.json().book.timePoints.map((t) => t.name);

describe('time points', () => {
  test('insert after id keeps order', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [a] = await seedTimePoints(app, bookId, ['A', 'C']);
    const res = await app.inject({
      method: 'POST', url: `/api/books/${bookId}/timepoints`, headers: { cookie },
      payload: { name: 'B', afterId: a },
    });
    expect(res.statusCode).toBe(201);
    expect(names(res)).toEqual(['A', 'B', 'C']);
    expect(res.json().book.timePoints.map((t: { position: number }) => t.position)).toEqual([0, 1, 2]);
    const first = await app.inject({
      method: 'POST', url: `/api/books/${bookId}/timepoints`, headers: { cookie },
      payload: { name: 'Z', afterId: null },
    });
    expect(names(first)).toEqual(['Z', 'A', 'B', 'C']);
    await app.close();
  });

  test('insert after unknown id is 422 unknown_time_point', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const res = await app.inject({
      method: 'POST', url: `/api/books/${bookId}/timepoints`, headers: { cookie },
      payload: { name: 'B', afterId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].code).toBe('unknown_time_point');
    await app.close();
  });

  test('rename a time point; other book id is 404', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const otherBook = await createBook(app, cookie);
    const [a] = await seedTimePoints(app, bookId, ['A', 'B']);
    const ok = await app.inject({
      method: 'PATCH', url: `/api/books/${bookId}/timepoints/${a}`, headers: { cookie }, payload: { name: 'A2' },
    });
    expect(names(ok)).toEqual(['A2', 'B']);
    const wrong = await app.inject({
      method: 'PATCH', url: `/api/books/${otherBook}/timepoints/${a}`, headers: { cookie }, payload: { name: 'X' },
    });
    expect(wrong.statusCode).toBe(404);
    const bad = await app.inject({
      method: 'PATCH', url: `/api/books/${bookId}/timepoints/${a}`, headers: { cookie }, payload: { name: '' },
    });
    expect(bad.statusCode).toBe(400);
    const nonUuid = await app.inject({
      method: 'PATCH', url: `/api/books/${bookId}/timepoints/nope`, headers: { cookie }, payload: { name: 'X' },
    });
    expect(nonUuid.statusCode).toBe(404);
    await app.close();
  });

  test('reorder rewrites positions', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [a, b, c] = await seedTimePoints(app, bookId, ['A', 'B', 'C']);
    const res = await app.inject({
      method: 'PUT', url: `/api/books/${bookId}/timepoints/order`, headers: { cookie },
      payload: { ids: [c, a, b] },
    });
    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(['C', 'A', 'B']);
    await app.close();
  });

  test('reorder with a non-permutation is 400 invalid_order', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [a, b] = await seedTimePoints(app, bookId, ['A', 'B']);
    for (const ids of [[a], [a, a], [a, b, '00000000-0000-4000-8000-000000000000']]) {
      const res = await app.inject({
        method: 'PUT', url: `/api/books/${bookId}/timepoints/order`, headers: { cookie }, payload: { ids },
      });
      expect([ids, res.statusCode, res.json()]).toEqual([ids, 400, { error: 'invalid_order' }]);
    }
    await app.close();
  });

  test('reorder rejects inverting order', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [t0, t1, t2] = await seedTimePoints(app, bookId);
    const lineId = await seedStoryline(app, bookId, t0!, t2!);
    const res = await app.inject({
      method: 'PUT', url: `/api/books/${bookId}/timepoints/order`, headers: { cookie },
      payload: { ids: [t2, t1, t0] },
    });
    expect(res.statusCode).toBe(422);
    const { issues } = res.json();
    expect(issues).toEqual([expect.objectContaining({ code: 'range_inverted' })]);
    expect(JSON.stringify(issues)).toContain(lineId);
    const get = await app.inject({ method: 'GET', url: `/api/books/${bookId}`, headers: { cookie } });
    expect(names(get)).toEqual(['T0', 'T1', 'T2']);
    await app.close();
  });

  test('delete used time point is 409 with usages', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [t0, , t2] = await seedTimePoints(app, bookId);
    const lineId = await seedStoryline(app, bookId, t0!, t2!, 'Strang A');
    const res = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/timepoints/${t0}`, headers: { cookie } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'time_point_in_use',
      usages: [{ kind: 'storyline', id: lineId, title: 'Strang A' }],
    });
    await app.close();
  });

  test('delete unused time point', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [t0, t1, t2] = await seedTimePoints(app, bookId);
    await seedStoryline(app, bookId, t0!, t2!);
    const res = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/timepoints/${t1}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(names(res)).toEqual(['T0', 'T2']);
    expect(res.json().book.timePoints.map((t: { position: number }) => t.position)).toEqual([0, 1]);
    await app.close();
  });
});
