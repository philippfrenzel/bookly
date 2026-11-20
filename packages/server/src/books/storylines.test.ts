/** Integration tests for the storyline endpoints. */
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registeredAgent, testApp } from '../test/helpers.js';
import { and, eq } from 'drizzle-orm';
import { characterWarningAcks, storylineCharacters } from '../db/schema.js';
import { seedCharacter, seedConnection, seedStoryline, seedTimePoints } from '../test/fixtures.js';

/** Creates a book through the API and returns its id. */
async function createBook(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  return res.json().book.id;
}

/** Sets up a user, a book and time points named Tag 1..4. */
async function setup() {
  const app = await testApp();
  const { cookie } = await registeredAgent(app);
  const bookId = await createBook(app, cookie);
  const tps = await seedTimePoints(app, bookId, ['Tag 1', 'Tag 2', 'Tag 3', 'Tag 4']);
  const base = `/api/books/${bookId}`;
  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url: base + url, headers: { cookie }, payload: payload as object });
  const patch = (url: string, payload: unknown) => app.inject({ method: 'PATCH', url: base + url, headers: { cookie }, payload: payload as object });
  return { app, cookie, bookId, tps, base, post, patch };
}

describe('storylines', () => {
  test('new storyline starts in_progress with kind default color', async () => {
    const { app, tps, post } = await setup();
    const main = await post('/storylines', { title: 'Haupt', range: { startId: tps[0], endId: tps[3] }, kind: 'main' });
    expect(main.statusCode).toBe(201);
    expect(main.json().book.storylines[0]).toMatchObject({ status: 'in_progress', color: '#2B59C3', kind: 'main' });
    const custom = await post('/storylines', { title: 'Neben', range: { startId: tps[0], endId: tps[1] }, kind: 'side', color: '#112233' });
    expect(custom.json().book.storylines.find((s: { title: string }) => s.title === 'Neben').color).toBe('#112233');
    const dflt = await post('/storylines', { title: 'Neben2', range: { startId: tps[0], endId: tps[1] }, kind: 'side' });
    expect(dflt.json().book.storylines.find((s: { title: string }) => s.title === 'Neben2').color).toBe('#8A94A6');
    await app.close();
  });

  test('inverted range is 422', async () => {
    const { app, tps, post } = await setup();
    const res = await post('/storylines', { title: 'X', range: { startId: tps[2], endId: tps[0] }, kind: 'main' });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].code).toBe('range_inverted');
    await app.close();
  });

  test('unknown time point and foreign character are 422, not 500', async () => {
    const { app, tps, post } = await setup();
    const unknownTp = await post('/storylines', { title: 'X', range: { startId: randomUUID(), endId: tps[0] }, kind: 'main' });
    expect(unknownTp.statusCode).toBe(422);
    expect(unknownTp.json().issues[0].code).toBe('unknown_time_point');
    const other = await registeredAgent(app);
    const otherBook = await createBook(app, other.cookie);
    const foreignChar = await seedCharacter(app, otherBook);
    const res = await post('/storylines', { title: 'X', range: { startId: tps[0], endId: tps[1] }, kind: 'main', characterIds: [foreignChar] });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].code).toBe('unknown_character');
    await app.close();
  });

  test('patch replaces characterIds and rejects foreign ones', async () => {
    const { app, bookId, tps, post, patch } = await setup();
    const a = await seedCharacter(app, bookId, 'A');
    const b = await seedCharacter(app, bookId, 'B');
    const created = await post('/storylines', { title: 'S', range: { startId: tps[0], endId: tps[1] }, kind: 'main', characterIds: [a] });
    const id = created.json().book.storylines[0].id;
    const res = await patch(`/storylines/${id}`, { characterIds: [b] });
    expect(res.json().book.storylines[0].characterIds).toEqual([b]);
    const bad = await patch(`/storylines/${id}`, { characterIds: [randomUUID()] });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().issues[0].code).toBe('unknown_character');
    await app.close();
  });

  test('main to side moves sections into note', async () => {
    const { app, tps, post, patch } = await setup();
    const created = await post('/storylines', {
      title: 'S', range: { startId: tps[0], endId: tps[3] }, kind: 'main', note: 'Alt',
    });
    const id = created.json().book.storylines[0].id;
    await post(`/storylines/${id}/sections`, {
      title: 'Aufbruch', description: 'Anna verlässt das Dorf.', range: { startId: tps[0], endId: tps[1] },
    });
    await post(`/storylines/${id}/sections`, { title: 'Ankunft', range: { startId: tps[2], endId: tps[3] } });
    const res = await patch(`/storylines/${id}`, { kind: 'side' });
    expect(res.statusCode).toBe(200);
    const s = res.json().book.storylines[0];
    expect(s.sections).toEqual([]);
    expect(s.kind).toBe('side');
    expect(s.color).toBe('#8A94A6');
    expect(s.note).toBe('Alt\n\nAbschnitt: Aufbruch (Tag 1 – Tag 2)\nAnna verlässt das Dorf.\n\nAbschnitt: Ankunft (Tag 3 – Tag 4)');
    await app.close();
  });

  test('main to side without existing note, and custom color is kept', async () => {
    const { app, tps, post, patch } = await setup();
    const created = await post('/storylines', {
      title: 'S', range: { startId: tps[0], endId: tps[3] }, kind: 'main', color: '#123456',
    });
    const id = created.json().book.storylines[0].id;
    await post(`/storylines/${id}/sections`, { title: 'A', description: 'd', range: { startId: tps[0], endId: tps[1] } });
    const s = (await patch(`/storylines/${id}`, { kind: 'side' })).json().book.storylines[0];
    expect(s.note).toBe('Abschnitt: A (Tag 1 – Tag 2)\nd');
    expect(s.color).toBe('#123456');
    await app.close();
  });

  test('main to side keeps section notes and characters in the note text', async () => {
    const { app, bookId, tps, post, patch } = await setup();
    const anna = await seedCharacter(app, bookId, 'Anna');
    const ben = await seedCharacter(app, bookId, 'Ben');
    const created = await post('/storylines', { title: 'S', range: { startId: tps[0], endId: tps[3] }, kind: 'main' });
    const id = created.json().book.storylines[0].id;
    await post(`/storylines/${id}/sections`, {
      title: 'A', description: 'd', characterIds: [anna, ben], note: 'Sektionsnotiz', range: { startId: tps[0], endId: tps[1] },
    });
    const s = (await patch(`/storylines/${id}`, { kind: 'side' })).json().book.storylines[0];
    const lines = s.note.split('\n');
    expect(lines.slice(0, 2)).toEqual(['Abschnitt: A (Tag 1 – Tag 2)', 'd']);
    expect(lines[2]).toMatch(/^Figuren: (Anna, Ben|Ben, Anna)$/);
    expect(lines[3]).toBe('Sektionsnotiz');
    expect(s.characterIds).toEqual([]);
    await app.close();
  });

  test('section on side strand is 422', async () => {
    const { app, tps, post } = await setup();
    const created = await post('/storylines', { title: 'S', range: { startId: tps[0], endId: tps[3] }, kind: 'side' });
    const id = created.json().book.storylines[0].id;
    const res = await post(`/storylines/${id}/sections`, { title: 'A', range: { startId: tps[0], endId: tps[1] } });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].code).toBe('section_on_side_strand');
    await app.close();
  });

  test('shrinking strand that strands a section is 422', async () => {
    const { app, tps, post, patch } = await setup();
    const created = await post('/storylines', { title: 'S', range: { startId: tps[0], endId: tps[3] }, kind: 'main' });
    const id = created.json().book.storylines[0].id;
    await post(`/storylines/${id}/sections`, { title: 'A', range: { startId: tps[2], endId: tps[3] } });
    const res = await patch(`/storylines/${id}`, { range: { startId: tps[0], endId: tps[1] } });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].code).toBe('section_outside_strand');
    await app.close();
  });

  test('delete storyline removes its connections', async () => {
    const { app, cookie, bookId, tps, base } = await setup();
    const a = await seedStoryline(app, bookId, tps[0]!, tps[1]!, 'A');
    const b = await seedStoryline(app, bookId, tps[0]!, tps[1]!, 'B');
    await seedConnection(app, bookId, a, b, 'merge');
    const res = await app.inject({ method: 'DELETE', url: `${base}/storylines/${a}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().book.storylines).toHaveLength(1);
    expect(res.json().book.connections).toEqual([]);
    await app.close();
  });

  test('unknown or malformed storyline id is 404', async () => {
    const { app, cookie, base } = await setup();
    for (const id of [randomUUID(), 'nope']) {
      const res = await app.inject({ method: 'PATCH', url: `${base}/storylines/${id}`, headers: { cookie }, payload: { title: 'x' } });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });

  test('keeps additions of retained characters', async () => {
    const { app, tps, bookId, post, patch } = await setup();
    const [a, b, c] = [await seedCharacter(app, bookId, 'A'), await seedCharacter(app, bookId, 'B'), await seedCharacter(app, bookId, 'C')];
    const created = await post('/storylines', { title: 'S', kind: 'side', range: { startId: tps[0], endId: tps[1] }, characterIds: [a, b] });
    const sid = created.json().book.storylines[0].id;
    await app.db.update(storylineCharacters).set({ behavior: 'ruhig' })
      .where(and(eq(storylineCharacters.storylineId, sid), eq(storylineCharacters.characterId, a)));
    await app.db.insert(characterWarningAcks).values({ storylineId: sid, characterId: b, criterion: 'behavior_change' });
    const first = await patch(`/storylines/${sid}`, { characterIds: [a] });
    expect(first.statusCode).toBe(200);
    expect(await app.db.select().from(characterWarningAcks).where(eq(characterWarningAcks.storylineId, sid))).toEqual([]);
    const second = await patch(`/storylines/${sid}`, { characterIds: [a, c] });
    const line = second.json().book.storylines[0];
    expect([...line.characterIds].sort()).toEqual([a, c].sort());
    expect(line.additions).toEqual(expect.arrayContaining([expect.objectContaining({ characterId: a, behavior: 'ruhig' })]));
    expect(line.additions.find((x: { characterId: string }) => x.characterId === b)).toBeUndefined();
    await app.close();
  });
  test('acks survive while the character is still linked by a section, and go with the last link', async () => {
    const { app, tps, bookId, cookie, base, post, patch } = await setup();
    const [a, b] = [await seedCharacter(app, bookId, 'A'), await seedCharacter(app, bookId, 'B')];
    const created = await post('/storylines', { title: 'S', kind: 'main', range: { startId: tps[0], endId: tps[3] }, characterIds: [a, b] });
    const sid = created.json().book.storylines[0].id;
    const sec = await post(`/storylines/${sid}/sections`, { title: 'X', range: { startId: tps[0], endId: tps[1] }, characterIds: [a] });
    const secId = sec.json().book.storylines[0].sections[0].id;
    const sec2 = await post(`/storylines/${sid}/sections`, { title: 'Y', range: { startId: tps[2], endId: tps[3] }, characterIds: [b] });
    const sec2Id = sec2.json().book.storylines[0].sections[1].id;
    await app.db.insert(characterWarningAcks).values([
      { storylineId: sid, characterId: a, criterion: 'behavior_change' },
      { storylineId: sid, characterId: b, criterion: 'behavior_change' },
    ]);
    const acked = async () =>
      (await app.db.select().from(characterWarningAcks).where(eq(characterWarningAcks.storylineId, sid))).map((r) => r.characterId).sort();
    // Unlinked from the storyline, both still linked through a section: acks stay.
    expect((await patch(`/storylines/${sid}`, { characterIds: [] })).statusCode).toBe(200);
    expect(await acked()).toEqual([a, b].sort());
    // A's last link (its section) is removed: A's ack goes.
    expect((await patch(`/sections/${secId}`, { characterIds: [] })).statusCode).toBe(200);
    expect(await acked()).toEqual([b]);
    // B's last link goes with its deleted section.
    const del = await app.inject({ method: 'DELETE', url: `${base}/sections/${sec2Id}`, headers: { cookie } });
    expect(del.statusCode).toBe(200);
    expect(await acked()).toEqual([]);
    await app.close();
  });

  test('a section change keeps acks of characters still linked by the storyline', async () => {
    const { app, tps, bookId, post, patch } = await setup();
    const a = await seedCharacter(app, bookId, 'A');
    const created = await post('/storylines', { title: 'S', kind: 'main', range: { startId: tps[0], endId: tps[3] }, characterIds: [a] });
    const sid = created.json().book.storylines[0].id;
    const sec = await post(`/storylines/${sid}/sections`, { title: 'X', range: { startId: tps[0], endId: tps[1] }, characterIds: [a] });
    const secId = sec.json().book.storylines[0].sections[0].id;
    await app.db.insert(characterWarningAcks).values({ storylineId: sid, characterId: a, criterion: 'behavior_change' });
    expect((await patch(`/sections/${secId}`, { characterIds: [] })).statusCode).toBe(200);
    expect(await app.db.select().from(characterWarningAcks).where(eq(characterWarningAcks.storylineId, sid))).toHaveLength(1);
    await app.close();
  });

  test('main to side drops acks of characters only linked by the moved sections', async () => {
    const { app, tps, bookId, post, patch } = await setup();
    const [a, b] = [await seedCharacter(app, bookId, 'A'), await seedCharacter(app, bookId, 'B')];
    const created = await post('/storylines', { title: 'S', kind: 'main', range: { startId: tps[0], endId: tps[3] }, characterIds: [a] });
    const sid = created.json().book.storylines[0].id;
    await post(`/storylines/${sid}/sections`, { title: 'X', range: { startId: tps[0], endId: tps[1] }, characterIds: [a, b] });
    await app.db.insert(characterWarningAcks).values([
      { storylineId: sid, characterId: a, criterion: 'behavior_change' },
      { storylineId: sid, characterId: b, criterion: 'behavior_change' },
    ]);
    expect((await patch(`/storylines/${sid}`, { kind: 'side' })).statusCode).toBe(200);
    const rows = await app.db.select().from(characterWarningAcks).where(eq(characterWarningAcks.storylineId, sid));
    expect(rows.map((r) => r.characterId)).toEqual([a]);
    await app.close();
  });
});
