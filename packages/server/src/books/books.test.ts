/** Integration tests for books, the aggregate loader and the transactional mutation pipeline. */
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { mutateBook } from '../db/mutate.js';
import { loadBook } from '../db/loadBook.js';
import { acknowledgements, connections, storylines, timePoints } from '../db/schema.js';
import { ValidationError } from '../errors.js';
import { registeredAgent, testApp } from '../test/helpers.js';

/** Creates a book through the API and returns its id. */
async function createBook(app: FastifyInstance, cookie: string, title = 'Roman'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title } });
  return res.json().book.id;
}

/** Inserts three ordered time points and returns their ids. */
async function seedTimePoints(app: FastifyInstance, bookId: string): Promise<string[]> {
  const rows = await app.db
    .insert(timePoints)
    .values([1, 2, 3].map((position) => ({ bookId, name: `T${position}`, position })))
    .returning({ id: timePoints.id });
  return rows.map((r) => r.id);
}

describe('books', () => {
  test('create and list books', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const first = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Erstes' } });
    expect(first.statusCode).toBe(201);
    await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Zweites' } });
    const list = await app.inject({ method: 'GET', url: '/api/books', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      { id: first.json().book.id, title: 'Erstes', storylineCount: 0 },
      { id: expect.any(String), title: 'Zweites', storylineCount: 0 },
    ]);
    await app.close();
  });

  test('new book aggregate is empty', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Leer' } });
    expect(res.json().book).toMatchObject({ title: 'Leer', timePoints: [], storylines: [], connections: [] });
    expect(res.json().hints).toEqual([]);
    await app.close();
  });

  test('rename, get and delete a book', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const id = await createBook(app, cookie);
    const patched = await app.inject({ method: 'PATCH', url: `/api/books/${id}`, headers: { cookie }, payload: { title: 'Neu' } });
    expect(patched.json().book.title).toBe('Neu');
    const got = await app.inject({ method: 'GET', url: `/api/books/${id}`, headers: { cookie } });
    expect(got.json().book.title).toBe('Neu');
    const bad = await app.inject({ method: 'PATCH', url: `/api/books/${id}`, headers: { cookie }, payload: { title: '' } });
    expect(bad.statusCode).toBe(400);
    const del = await app.inject({ method: 'DELETE', url: `/api/books/${id}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    const gone = await app.inject({ method: 'GET', url: `/api/books/${id}`, headers: { cookie } });
    expect(gone.statusCode).toBe(404);
    await app.close();
  });

  test('unauthenticated access is 401', async () => {
    const app = await testApp();
    expect((await app.inject({ method: 'GET', url: '/api/books' })).statusCode).toBe(401);
    await app.close();
  });

  test('foreign book is 404 on every route family', async () => {
    const app = await testApp();
    const owner = await registeredAgent(app);
    const other = await registeredAgent(app);
    const bookId = await createBook(app, owner.cookie);
    // Later tasks append [method, path] rows for their route families.
    const routes: Array<[string, string]> = [
      ['GET', `/api/books/${bookId}`],
      ['PATCH', `/api/books/${bookId}`],
      ['DELETE', `/api/books/${bookId}`],
      ['POST', `/api/books/${bookId}/timepoints`],
      ['PUT', `/api/books/${bookId}/timepoints/order`],
      ['DELETE', `/api/books/${bookId}/timepoints/${randomUUID()}`],
      ['POST', `/api/books/${bookId}/characters`],
      ['DELETE', `/api/books/${bookId}/characters/${randomUUID()}`],
      ['POST', `/api/books/${bookId}/storylines`],
      ['PATCH', `/api/books/${bookId}/storylines/${randomUUID()}`],
      ['DELETE', `/api/books/${bookId}/sections/${randomUUID()}`],
      ['POST', `/api/books/${bookId}/connections`],
      ['PATCH', `/api/books/${bookId}/connections/${randomUUID()}`],
      ['DELETE', `/api/books/${bookId}/connections/${randomUUID()}`],
      ['POST', `/api/books/${bookId}/acknowledgements`],
      ['DELETE', `/api/books/${bookId}/acknowledgements`],
    ];
    for (const [method, path] of routes) {
      const res = await app.inject({
        method: method as 'GET',
        url: path,
        headers: { cookie: other.cookie },
        payload: method === 'PATCH' ? { title: 'Hack' } : method === 'GET' || method === 'DELETE' ? undefined : {},
      });
      expect([method, path, res.statusCode]).toEqual([method, path, 404]);
    }
    const stillThere = await app.inject({ method: 'GET', url: `/api/books/${bookId}`, headers: { cookie: owner.cookie } });
    expect(stillThere.json().book.title).toBe('Roman');
    await app.close();
  });

  test('non-uuid book id is 404', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const res = await app.inject({ method: 'GET', url: '/api/books/not-a-uuid', headers: { cookie } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  test('mutateBook rolls back on validation issues', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [t1, , t3] = await seedTimePoints(app, bookId);
    const attempt = mutateBook(app.db, bookId, async (tx) => {
      await tx.insert(storylines).values({
        bookId, title: 'Verkehrt', startId: t3!, endId: t1!, kind: 'main', status: 'in_progress', color: '#2B59C3',
      });
    });
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({ issues: [{ code: 'range_inverted' }] });
    expect((await loadBook(app.db, bookId)).storylines).toEqual([]);
    await app.close();
  });

  test('stale acknowledgement removed after app.mutate', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [t1, t2, t3] = await seedTimePoints(app, bookId);
    const line = (title: string) => ({
      bookId, title, startId: t1!, endId: t1!, kind: 'main', status: 'in_progress', color: '#2B59C3',
    });
    const [a, b] = await app.db.insert(storylines).values([line('A'), line('B')]).returning({ id: storylines.id });
    const [conn] = await app.db
      .insert(connections)
      .values({ bookId, fromId: a!.id, toId: b!.id, type: 'time_jump' })
      .returning({ id: connections.id });
    await app.db.insert(acknowledgements).values({ connectionId: conn!.id, rule: 'time_jump_order' });

    const before = await app.mutate(bookId, async () => {});
    expect(before.hints).toMatchObject([{ rule: 'time_jump_order', acknowledged: true }]);
    expect(before.book.acknowledgements).toHaveLength(1);

    const after = await app.mutate(bookId, async (tx) => {
      await tx.update(storylines).set({ startId: t2!, endId: t3! }).where(eq(storylines.id, b!.id));
    });
    expect(after.hints).toEqual([]);
    expect(after.book.acknowledgements).toEqual([]);
    expect(await app.db.select().from(acknowledgements)).toEqual([]);
    await app.close();
  });
});
