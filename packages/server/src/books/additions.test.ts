/** Integration tests for the per-storyline character addition endpoint and addition loading. */
import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { storylineCharacters } from '../db/schema.js';
import { loadBook } from '../db/loadBook.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedStoryline, seedTimePoints } from '../test/fixtures.js';

/** Creates a book through the API and returns its id. */
async function createBook(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  return res.json().book.id;
}

/** Sets up a book with one storyline and one character linked to it. */
async function setup() {
  const app = await testApp();
  const { cookie } = await registeredAgent(app);
  const bookId = await createBook(app, cookie);
  const [t0, , t2] = await seedTimePoints(app, bookId);
  const storyId = await seedStoryline(app, bookId, t0!, t2!);
  const charId = await seedCharacter(app, bookId, 'Anna');
  await app.db.insert(storylineCharacters).values({ storylineId: storyId, characterId: charId });
  const put = (book: string, story: string, char: string, payload: unknown) =>
    app.inject({
      method: 'PUT', url: `/api/books/${book}/storylines/${story}/characters/${char}/addition`,
      headers: { cookie }, payload: payload as object,
    });
  return { app, cookie, bookId, storyId, charId, put };
}

describe('additions', () => {
  test('sets and clears an addition', async () => {
    const { app, bookId, storyId, charId, put } = await setup();
    const set = await put(bookId, storyId, charId, { behavior: 'zögerlich', intentions: 'flüchten' });
    expect(set.statusCode).toBe(200);
    expect(set.json().book.storylines[0].additions).toEqual([
      { characterId: charId, behavior: 'zögerlich', intentions: 'flüchten' },
    ]);
    const cleared = await put(bookId, storyId, charId, { behavior: '' });
    expect(cleared.json().book.storylines[0].additions).toEqual([
      { characterId: charId, behavior: null, intentions: 'flüchten' },
    ]);
    await app.close();
  });

  test('404 for unlinked character', async () => {
    const { app, bookId, storyId, put } = await setup();
    const other = await seedCharacter(app, bookId, 'Ben');
    expect((await put(bookId, storyId, other, { behavior: 'x' })).statusCode).toBe(404);
    await app.close();
  });

  test('404 for foreign book', async () => {
    const { app, cookie, storyId, charId, put } = await setup();
    const otherBook = await createBook(app, cookie);
    expect((await put(otherBook, storyId, charId, { behavior: 'x' })).statusCode).toBe(404);
    await app.close();
  });

  test('400 for over-long text', async () => {
    const { app, bookId, storyId, charId, put } = await setup();
    expect((await put(bookId, storyId, charId, { behavior: 'x'.repeat(2001) })).statusCode).toBe(400);
    await app.close();
  });

  test('loadBook orders unnamed characters last and maps additions', async () => {
    const { app, bookId, storyId, charId } = await setup();
    const unnamed = await seedCharacter(app, bookId, null);
    const zed = await seedCharacter(app, bookId, 'Zed');
    await app.db.insert(storylineCharacters).values({ storylineId: storyId, characterId: unnamed, behavior: 'still' });
    const book = await loadBook(app.db, bookId);
    expect(book.characters.map((c) => c.id)).toEqual([charId, zed, unnamed]);
    const line = book.storylines[0]!;
    expect(line.additions).toHaveLength(2);
    expect(line.additions).toContainEqual({ characterId: unnamed, behavior: 'still', intentions: null });
    expect(line.additions).toContainEqual({ characterId: charId, behavior: null, intentions: null });
    await app.close();
  });
});
