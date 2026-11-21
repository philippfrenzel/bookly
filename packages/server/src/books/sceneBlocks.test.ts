/** Integration tests for the text blocks of scene assignments: migration backfill, PUT blocks, legacy PATCH/POST and revisions. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { sql } from 'drizzle-orm';
import { joinBlocks, SCENE_BLOCK_LIMITS } from '@bookly/shared';
import type { SceneAssignment } from '@bookly/shared';
import { registeredAgent, testApp } from '../test/helpers.js';
import { NotFoundError } from '../errors.js';
import { assertRevision } from './sceneBlocks.js';
import { seedTimePoints } from '../test/fixtures.js';

const MIGRATION = fileURLToPath(new URL('../../drizzle/0008_scene_blocks.sql', import.meta.url));

/** A user with one book, a main storyline with a section, a side strand and one scene. */
async function setup() {
  const app = await testApp();
  const { cookie } = await registeredAgent(app);
  const created = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  const bookId: string = created.json().book.id;
  const tps = await seedTimePoints(app, bookId, ['T0', 'T1', 'T2', 'T3']);
  const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object) =>
    app.inject({ method, url: `/api/books/${bookId}${path}`, headers: { cookie }, ...(payload && { payload }) });
  const line = await req('POST', '/storylines', { title: 'Reise', kind: 'main', range: { startId: tps[0], endId: tps[3] } });
  const storylineId: string = line.json().book.storylines[0].id;
  const sec = await req('POST', `/storylines/${storylineId}/sections`, { title: 'Ankunft', range: { startId: tps[0], endId: tps[1] } });
  const sectionId: string = sec.json().book.storylines[0].sections[0].id;
  const side = await req('POST', '/storylines', { title: 'Erinnerung', kind: 'side', range: { startId: tps[1], endId: tps[2] } });
  const sideId: string = (side.json().book.storylines as { id: string; title: string }[]).find((l) => l.title === 'Erinnerung')!.id;
  const scene = await req('POST', '/scenes', { name: 'Bergsee' });
  const sceneId: string = scene.json().scenes[0].id;
  /** Assigns the scene to a target and returns the new assignment. */
  const assign = async (target: { sectionId: string } | { storylineId: string }, description = '') => {
    const res = await req('POST', '/scene-assignments', { sceneId, ...target, description });
    expect(res.statusCode).toBe(201);
    const key = 'sectionId' in target ? 'sectionId' : 'storylineId';
    const value = 'sectionId' in target ? target.sectionId : target.storylineId;
    return (res.json().sceneAssignments as SceneAssignment[]).find((a) => a[key] === value)!;
  };
  /** The current state of one assignment. */
  const current = async (id: string) =>
    ((await req('GET', '')).json().sceneAssignments as SceneAssignment[]).find((a) => a.id === id)!;
  const put = (id: string, body: object) => req('PUT', `/scene-assignments/${id}/blocks`, body);
  return { app, cookie, bookId, req, sectionId, sideId, sceneId, assign, current, put };
}

describe('migration 0008 backfill', () => {
  test('every assignment gets exactly one block with its exact description', async () => {
    const { app, req, sectionId, sideId, assign, current } = await setup();
    const a = await assign({ sectionId }, 'x');
    const b = await assign({ storylineId: sideId }, 'y');
    // Legacy rows: exact (untrimmed) description, and an empty one; no blocks yet.
    await app.db.execute(sql`UPDATE scene_assignments SET description = ${'  Zeile\n\nzwei  '} WHERE id = ${a.id}`);
    await app.db.execute(sql`UPDATE scene_assignments SET description = '' WHERE id = ${b.id}`);
    await app.db.execute(sql`DELETE FROM scene_assignment_blocks`);
    const statement = readFileSync(MIGRATION, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .find((s) => s.startsWith('INSERT INTO "scene_assignment_blocks"'));
    expect(statement).toBeDefined();
    await app.db.execute(sql.raw(statement!));
    const count = await app.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM scene_assignment_blocks`);
    expect(count[0]!.n).toBe(2);
    expect((await current(a.id)).blocks.map((x) => x.text)).toEqual(['  Zeile\n\nzwei  ']);
    expect((await current(b.id)).blocks.map((x) => x.text)).toEqual(['']);
    expect((await req('GET', '')).statusCode).toBe(200);
    await app.close();
  });
});

describe('PUT scene assignment blocks', () => {
  test.each(['section', 'storyline'] as const)('splits and reorders blocks for a %s target', async (kind) => {
    const { app, sectionId, sideId, assign, put } = await setup();
    const a = await assign(kind === 'section' ? { sectionId } : { storylineId: sideId }, 'Erster Teil. Zweiter Teil.');
    expect(a.blocks).toHaveLength(1);
    expect(a.revision).toBe(0);
    const first = a.blocks[0]!;
    // Split at the caret: nothing is lost or trimmed.
    const split = await put(a.id, { revision: 0, blocks: [{ id: first.id, text: 'Erster Teil.' }, { text: ' Zweiter Teil.' }] });
    expect(split.statusCode).toBe(200);
    const s = (split.json().sceneAssignments as SceneAssignment[]).find((x) => x.id === a.id)!;
    expect(s.blocks.map((x) => x.text)).toEqual(['Erster Teil.', ' Zweiter Teil.']);
    expect(s.blocks[0]!.id).toBe(first.id);
    expect(s.description).toBe(joinBlocks(['Erster Teil.', ' Zweiter Teil.']));
    expect(s.revision).toBe(1);
    // Reorder and insert a new block in the middle.
    const [b0, b1] = s.blocks as [SceneAssignment['blocks'][0], SceneAssignment['blocks'][0]];
    const re = await put(a.id, { revision: 1, blocks: [{ id: b1.id, text: b1.text }, { text: '' }, { id: b0.id, text: b0.text }] });
    expect(re.statusCode).toBe(200);
    const r = (re.json().sceneAssignments as SceneAssignment[]).find((x) => x.id === a.id)!;
    expect(r.blocks.map((x) => x.id)).toEqual([b1.id, expect.any(String), b0.id]);
    expect(r.blocks.map((x) => x.text)).toEqual([' Zweiter Teil.', '', 'Erster Teil.']);
    expect(r.description).toBe(' Zweiter Teil.\n\n\n\nErster Teil.');
    expect(r.revision).toBe(2);
    // Omitted blocks are deleted.
    const del = await put(a.id, { revision: 2, blocks: [{ id: b0.id, text: 'Nur noch einer' }] });
    const d = (del.json().sceneAssignments as SceneAssignment[]).find((x) => x.id === a.id)!;
    expect(d.blocks).toEqual([{ id: b0.id, text: 'Nur noch einer' }]);
    expect(d.description).toBe('Nur noch einer');
    await app.close();
  });

  test('a stale revision is 409 and nothing changes', async () => {
    const { app, sectionId, assign, current, put } = await setup();
    const a = await assign({ sectionId }, 'Text');
    expect((await put(a.id, { revision: 0, blocks: [{ id: a.blocks[0]!.id, text: 'Neu' }] })).statusCode).toBe(200);
    const before = await current(a.id);
    const stale = await put(a.id, { revision: 0, blocks: [{ text: 'Alt' }] });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'stale' });
    expect(await current(a.id)).toEqual(before);
    await app.close();
  });

  test('a block id of another assignment is 400 unknown_block and nothing changes', async () => {
    const { app, sectionId, sideId, assign, current, put } = await setup();
    const a = await assign({ sectionId }, 'A');
    const b = await assign({ storylineId: sideId }, 'B');
    const before = await current(a.id);
    const res = await put(a.id, { revision: 0, blocks: [{ id: b.blocks[0]!.id, text: 'gestohlen' }] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'unknown_block' });
    expect(await current(a.id)).toEqual(before);
    expect((await current(b.id)).blocks).toEqual(b.blocks);
    await app.close();
  });

  test('invalid bodies are 400, unknown assignment and foreign book are 404', async () => {
    const { app, sectionId, assign, put, req } = await setup();
    const a = await assign({ sectionId }, 'A');
    expect((await put(a.id, { revision: 0, blocks: [] })).statusCode).toBe(400);
    expect((await put(a.id, { blocks: [{ text: 'x' }] })).statusCode).toBe(400);
    expect((await put(a.id, { revision: 0, blocks: [{ text: 'x'.repeat(10001) }] })).statusCode).toBe(400);
    const dup = a.blocks[0]!.id;
    expect((await put(a.id, { revision: 0, blocks: [{ id: dup, text: 'a' }, { id: dup, text: 'b' }] })).json()).toMatchObject({ error: 'invalid_body' });
    expect((await put('00000000-0000-4000-8000-000000000000', { revision: 0, blocks: [{ text: 'x' }] })).statusCode).toBe(404);
    expect((await req('PUT', `/scene-assignments/kein-uuid/blocks`, { revision: 0, blocks: [{ text: 'x' }] })).statusCode).toBe(404);
    const other = await registeredAgent(app);
    const book2 = (await app.inject({ method: 'POST', url: '/api/books', headers: { cookie: other.cookie }, payload: { title: 'B' } })).json().book.id;
    const foreign = await app.inject({
      method: 'PUT', url: `/api/books/${book2}/scene-assignments/${a.id}/blocks`, headers: { cookie: other.cookie }, payload: { revision: 0, blocks: [{ text: 'x' }] },
    });
    expect(foreign.statusCode).toBe(404);
    await app.close();
  });
});

describe('PUT blocks body size', () => {
  test('a body of about 1.5 MB (umlauts) is accepted', async () => {
    const { app, sectionId, assign, put } = await setup();
    const a = await assign({ sectionId }, 'A');
    const blocks = Array.from({ length: 150 }, () => ({ text: 'ä'.repeat(5000) }));
    expect(Buffer.byteLength(JSON.stringify({ revision: 0, blocks }))).toBeGreaterThan(1_500_000);
    const res = await put(a.id, { revision: 0, blocks });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('assertRevision', () => {
  test('a missing assignment is NotFoundError, not stale', async () => {
    const { app } = await setup();
    await expect(app.db.transaction((tx) => assertRevision(tx, '00000000-0000-4000-8000-000000000000', 0))).rejects.toBeInstanceOf(NotFoundError);
    await app.close();
  });
});

describe('whole descriptions are split into blocks', () => {
  const paras = [`Erster ${'a'.repeat(900)}`, `  Zweiter ${'b'.repeat(900)}`, `Dritter ${'c'.repeat(900)}`];
  const long = joinBlocks(paras);

  test('POST with a long three-paragraph text creates three exact blocks', async () => {
    const { app, sectionId, assign } = await setup();
    expect(long.length).toBeGreaterThan(2000);
    const a = await assign({ sectionId }, long);
    expect(a.blocks.map((b) => b.text)).toEqual(paras);
    expect(a.description).toBe(long);
    expect(a.revision).toBe(0);
    await app.close();
  });

  test('PATCH with a long three-paragraph text replaces the blocks by three exact ones', async () => {
    const { app, req, sectionId, assign, current } = await setup();
    const a = await assign({ sectionId }, 'Eins');
    const res = await req('PATCH', `/scene-assignments/${a.id}`, { description: long, revision: 0 });
    expect(res.statusCode).toBe(200);
    const p = await current(a.id);
    expect(p.blocks.map((b) => b.text)).toEqual(paras);
    expect(p.description).toBe(long);
    expect(p.revision).toBe(1);
    await app.close();
  });

  test('201 paragraphs become 200 blocks, the rest merged into the last; the text stays identical', async () => {
    const { app, req, sectionId, assign, current } = await setup();
    const many = joinBlocks(Array.from({ length: SCENE_BLOCK_LIMITS.count + 1 }, (_, i) => `Absatz ${i}`));
    const a = await assign({ sectionId }, many);
    expect(a.blocks).toHaveLength(SCENE_BLOCK_LIMITS.count);
    expect(a.blocks.at(-1)!.text).toBe(`Absatz ${SCENE_BLOCK_LIMITS.count - 1}\n\nAbsatz ${SCENE_BLOCK_LIMITS.count}`);
    expect(joinBlocks(a.blocks.map((b) => b.text))).toBe(many);
    expect(a.description).toBe(many);
    const b = await req('PATCH', `/scene-assignments/${a.id}`, { description: many, revision: 0 });
    expect(b.statusCode).toBe(200);
    const p = await current(a.id);
    expect(p.blocks).toHaveLength(SCENE_BLOCK_LIMITS.count);
    expect(p.description).toBe(many);
    await app.close();
  });

  test('a paragraph longer than a block is 400 invalid_body and nothing is written', async () => {
    const { app, req, sectionId, sceneId, assign, current } = await setup();
    const tooLong = 'x'.repeat(SCENE_BLOCK_LIMITS.text + 1);
    const created = await req('POST', '/scene-assignments', { sceneId, sectionId, description: tooLong });
    expect(created.statusCode).toBe(400);
    expect(created.json()).toMatchObject({ error: 'invalid_body' });
    expect((await req('GET', '')).json().sceneAssignments).toEqual([]);
    const a = await assign({ sectionId }, 'Bleibt');
    const patched = await req('PATCH', `/scene-assignments/${a.id}`, { description: `kurz\n\n${tooLong}` });
    expect(patched.statusCode).toBe(400);
    expect(patched.json()).toMatchObject({ error: 'invalid_body' });
    expect(await current(a.id)).toEqual(a);
    await app.close();
  });
});

describe('legacy assignment requests', () => {
  test('POST creates one block with the description', async () => {
    const { app, sectionId, assign } = await setup();
    const a = await assign({ sectionId }, 'Ein klarer See.');
    expect(a.blocks).toEqual([{ id: expect.any(String), text: 'Ein klarer See.' }]);
    expect(a.revision).toBe(0);
    await app.close();
  });

  test('PATCH description replaces all blocks with one and bumps the revision; stale revision is 409', async () => {
    const { app, req, sectionId, assign, current, put } = await setup();
    const a = await assign({ sectionId }, 'Eins');
    await put(a.id, { revision: 0, blocks: [{ text: 'A' }, { text: 'B' }] });
    const patched = await req('PATCH', `/scene-assignments/${a.id}`, { description: 'Frühere Beschreibung' });
    expect(patched.statusCode).toBe(200);
    const p = await current(a.id);
    expect(p.blocks).toEqual([{ id: expect.any(String), text: 'Frühere Beschreibung' }]);
    expect(p.description).toBe('Frühere Beschreibung');
    expect(p.revision).toBe(2);
    const stale = await req('PATCH', `/scene-assignments/${a.id}`, { description: 'Zu spät', revision: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'stale' });
    expect(await current(a.id)).toEqual(p);
    const fresh = await req('PATCH', `/scene-assignments/${a.id}`, { description: 'Rechtzeitig', revision: 2 });
    expect(fresh.statusCode).toBe(200);
    expect((await current(a.id)).revision).toBe(3);
    await app.close();
  });

  test('a pure move keeps blocks and revision', async () => {
    const { app, req, sectionId, sideId, assign, current } = await setup();
    const a = await assign({ sectionId }, 'Bleibt');
    const moved = await req('PATCH', `/scene-assignments/${a.id}`, { storylineId: sideId });
    expect(moved.statusCode).toBe(200);
    const m = await current(a.id);
    expect(m.storylineId).toBe(sideId);
    expect(m.blocks).toEqual(a.blocks);
    expect(m.revision).toBe(0);
    await app.close();
  });
});
