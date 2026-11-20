/** Integration tests for the connection and acknowledgement endpoints. */
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedStoryline, seedTimePoints } from '../test/fixtures.js';

/** Creates a book through the API and returns its id. */
async function createBook(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  return res.json().book.id;
}

/** Sets up a user, a book, time points T0..T2 and two storylines a (T0..T1) and b (T0..T2). */
async function setup() {
  const app = await testApp();
  const { cookie } = await registeredAgent(app);
  const bookId = await createBook(app, cookie);
  const tps = await seedTimePoints(app, bookId);
  const a = await seedStoryline(app, bookId, tps[0]!, tps[1]!, 'A');
  const b = await seedStoryline(app, bookId, tps[0]!, tps[2]!, 'B');
  const base = `/api/books/${bookId}`;
  const call = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url: base + url, headers: { cookie }, payload: payload as object });
  /** A time_jump a to b contradicts the order: b does not begin after a ends. */
  const jump = () => call('POST', '/connections', { fromId: a, toId: b, type: 'time_jump' });
  return { app, cookie, bookId, tps, a, b, base, call, jump };
}

describe('connections', () => {
  test('contradicting connection is saved and returns hint', async () => {
    const { app, jump } = await setup();
    const res = await jump();
    expect(res.statusCode).toBe(201);
    expect(res.json().book.connections).toHaveLength(1);
    expect(res.json().hints[0]).toMatchObject({ rule: 'time_jump_order', acknowledged: false });
    await app.close();
  });

  test('self connection is 422', async () => {
    const { app, a, call } = await setup();
    const res = await call('POST', '/connections', { fromId: a, toId: a, type: 'merge' });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].code).toBe('self_connection');
    await app.close();
  });

  test('unknown storyline and foreign character are 422, not 500', async () => {
    const { app, a, b, call } = await setup();
    const unknown = await call('POST', '/connections', { fromId: a, toId: randomUUID(), type: 'merge' });
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().issues[0].code).toBe('unknown_storyline');
    const other = await registeredAgent(app);
    const foreign = await seedCharacter(app, await createBook(app, other.cookie));
    const res = await call('POST', '/connections', { fromId: a, toId: b, type: 'character_switch', characterId: foreign });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].code).toBe('unknown_character');
    await app.close();
  });

  test('patch and delete a connection', async () => {
    const { app, jump, call } = await setup();
    const id = (await jump()).json().book.connections[0].id;
    const patched = await call('PATCH', `/connections/${id}`, { type: 'merge', label: 'Treffen' });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().book.connections[0]).toMatchObject({ type: 'merge', label: 'Treffen' });
    expect(patched.json().hints).toEqual([]);
    const del = await call('DELETE', `/connections/${id}`);
    expect(del.statusCode).toBe(200);
    expect(del.json().book.connections).toEqual([]);
    expect((await call('DELETE', `/connections/${id}`)).statusCode).toBe(404);
    await app.close();
  });

  test('acknowledge sets acknowledged flag, is idempotent and can be removed', async () => {
    const { app, jump, call } = await setup();
    const connectionId = (await jump()).json().book.connections[0].id;
    const body = { connectionId, rule: 'time_jump_order', characterId: null };
    const first = await call('POST', '/acknowledgements', body);
    expect(first.statusCode).toBe(200);
    expect(first.json().hints[0]).toMatchObject({ rule: 'time_jump_order', acknowledged: true });
    const again = await call('POST', '/acknowledgements', body);
    expect(again.statusCode).toBe(200);
    expect(again.json().book.acknowledgements).toHaveLength(1);
    const removed = await call('DELETE', '/acknowledgements', body);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().hints[0].acknowledged).toBe(false);
    expect(removed.json().book.acknowledgements).toEqual([]);
    await app.close();
  });

  test('acknowledging non-existent hint is 400', async () => {
    const { app, jump, call } = await setup();
    const connectionId = (await jump()).json().book.connections[0].id;
    const res = await call('POST', '/acknowledgements', { connectionId, rule: 'flashback_order', characterId: null });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'no_such_hint' });
    await app.close();
  });

  test('acknowledgement of a connection in another book is 404', async () => {
    const { app, call } = await setup();
    const other = await registeredAgent(app);
    const otherBook = await createBook(app, other.cookie);
    const [t0, t1] = await seedTimePoints(app, otherBook, ['X0', 'X1']);
    const oa = await seedStoryline(app, otherBook, t0!, t0!);
    const ob = await seedStoryline(app, otherBook, t0!, t1!);
    const created = await app.inject({
      method: 'POST',
      url: `/api/books/${otherBook}/connections`,
      headers: { cookie: other.cookie },
      payload: { fromId: oa, toId: ob, type: 'time_jump' },
    });
    const foreignId = created.json().book.connections[0].id;
    const res = await call('POST', '/acknowledgements', { connectionId: foreignId, rule: 'time_jump_order', characterId: null });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  test('fixing cause drops acknowledgement; reintroducing shows unacknowledged hint', async () => {
    const { app, tps, b, jump, call } = await setup();
    const connectionId = (await jump()).json().book.connections[0].id;
    await call('POST', '/acknowledgements', { connectionId, rule: 'time_jump_order', characterId: null });
    const fixed = await call('PATCH', `/storylines/${b}`, { range: { startId: tps[2], endId: tps[2] } });
    expect(fixed.statusCode).toBe(200);
    expect(fixed.json().hints).toEqual([]);
    expect(fixed.json().book.acknowledgements).toEqual([]);
    const back = await call('PATCH', `/storylines/${b}`, { range: { startId: tps[0], endId: tps[2] } });
    expect(back.json().hints[0]).toMatchObject({ rule: 'time_jump_order', acknowledged: false });
    expect(back.json().book.acknowledgements).toEqual([]);
    await app.close();
  });
});
