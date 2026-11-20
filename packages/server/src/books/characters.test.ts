/** Integration tests for the character endpoints. */
import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { storylineCharacters } from '../db/schema.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedConnection, seedStoryline, seedTimePoints } from '../test/fixtures.js';

/** Creates a book through the API and returns its id. */
async function createBook(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  return res.json().book.id;
}

describe('characters', () => {
  test('create, patch and delete', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const created = await app.inject({
      method: 'POST', url: `/api/books/${bookId}/characters`, headers: { cookie },
      payload: { name: 'Anna', description: 'Heldin' },
    });
    expect(created.statusCode).toBe(201);
    const [anna] = created.json().book.characters;
    expect(anna).toMatchObject({ name: 'Anna', description: 'Heldin' });
    const patched = await app.inject({
      method: 'PATCH', url: `/api/books/${bookId}/characters/${anna.id}`, headers: { cookie },
      payload: { name: 'Anna B.' },
    });
    expect(patched.json().book.characters[0]).toMatchObject({ name: 'Anna B.' });
    const bad = await app.inject({
      method: 'POST', url: `/api/books/${bookId}/characters`, headers: { cookie }, payload: { name: 'x'.repeat(201) },
    });
    expect(bad.statusCode).toBe(400);
    const del = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/characters/${anna.id}`, headers: { cookie } });
    expect(del.statusCode).toBe(200);
    expect(del.json().book.characters).toEqual([]);
    await app.close();
  });

  test('creates an empty character', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const res = await app.inject({ method: 'POST', url: `/api/books/${bookId}/characters`, headers: { cookie }, payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json().book.characters).toEqual([
      expect.objectContaining({ name: null, description: null, behavior: null, intentions: null }),
    ]);
    await app.close();
  });

  test('patches behaviour only', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const created = await app.inject({
      method: 'POST', url: `/api/books/${bookId}/characters`, headers: { cookie },
      payload: { name: 'Anna', description: 'Heldin', intentions: 'Rache' },
    });
    const id = created.json().book.characters[0].id;
    const res = await app.inject({
      method: 'PATCH', url: `/api/books/${bookId}/characters/${id}`, headers: { cookie }, payload: { behavior: 'mutig' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().book.characters[0]).toMatchObject({
      name: 'Anna', description: 'Heldin', behavior: 'mutig', intentions: 'Rache',
    });
    await app.close();
  });

  test('empty name clears the name instead of failing', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const id = await seedCharacter(app, bookId, 'Anna');
    const res = await app.inject({
      method: 'PATCH', url: `/api/books/${bookId}/characters/${id}`, headers: { cookie }, payload: { name: '' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().book.characters[0].name).toBeNull();
    await app.close();
  });

  test('character of another book is 404 even for the owner of both', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const otherBook = await createBook(app, cookie);
    const charId = await seedCharacter(app, bookId);
    for (const [method, payload] of [['PATCH', { name: 'X' }], ['DELETE', undefined]] as const) {
      const res = await app.inject({
        method, url: `/api/books/${otherBook}/characters/${charId}`, headers: { cookie }, payload,
      });
      expect([method, res.statusCode]).toEqual([method, 404]);
    }
    await app.close();
  });

  test('character delete keeps switch connection', async () => {
    const app = await testApp();
    const { cookie } = await registeredAgent(app);
    const bookId = await createBook(app, cookie);
    const [t0, , t2] = await seedTimePoints(app, bookId);
    const a = await seedStoryline(app, bookId, t0!, t2!, 'A');
    const b = await seedStoryline(app, bookId, t0!, t2!, 'B');
    const charId = await seedCharacter(app, bookId);
    await app.db.insert(storylineCharacters).values([
      { storylineId: a, characterId: charId },
      { storylineId: b, characterId: charId },
    ]);
    const connId = await seedConnection(app, bookId, a, b, 'character_switch', charId);
    const res = await app.inject({ method: 'DELETE', url: `/api/books/${bookId}/characters/${charId}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { book, hints } = res.json();
    expect(book.characters).toEqual([]);
    expect(book.storylines.every((s: { characterIds: string[] }) => s.characterIds.length === 0)).toBe(true);
    expect(book.connections).toEqual([expect.objectContaining({ id: connId, characterId: null })]);
    expect(hints).toEqual([expect.objectContaining({ connectionId: connId, rule: 'switch_character_missing' })]);
    await app.close();
  });
});
