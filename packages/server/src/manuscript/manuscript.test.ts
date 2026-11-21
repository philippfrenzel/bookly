/** Integration tests for the manuscript: AI structure, Bausteine, versions, reviewers with rights and locks. */
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import type { ManuscriptResponse } from '@bookly/shared';
import { createFakeAiClient } from '../ai/fake.js';
import { blocks } from '../db/schema.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedTimePoints } from '../test/fixtures.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** An author with a book of two storylines (one with two sections) and a scene; AI is the fake client. */
async function setup() {
  const app = await testApp({ ai: createFakeAiClient() });
  const author = await registeredAgent(app, 'autorin@example.de');
  const created = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie: author.cookie }, payload: { title: 'Roman' } });
  const bookId: string = created.json().book.id;
  const tps = await seedTimePoints(app, bookId, ['T0', 'T1', 'T2']);
  const as = (cookie: string) => (method: Method, path: string, payload?: object) =>
    app.inject({ method, url: `/api/books/${bookId}${path}`, headers: { cookie }, ...(payload && { payload }) });
  const req = as(author.cookie);
  const line = await req('POST', '/storylines', { title: 'Reise', kind: 'main', range: { startId: tps[0], endId: tps[2] } });
  const storylineId: string = line.json().book.storylines[0].id;
  await req('POST', `/storylines/${storylineId}/sections`, { title: 'Ankunft', range: { startId: tps[0], endId: tps[1] } });
  await req('POST', `/storylines/${storylineId}/sections`, { title: 'Abschied', range: { startId: tps[1], endId: tps[2] } });
  await req('POST', '/storylines', { title: 'Traum', kind: 'side', range: { startId: tps[0], endId: tps[1] } });
  const ms = async (r: Awaited<ReturnType<typeof req>>) => r.json() as ManuscriptResponse;
  /** Accepts a fresh AI proposal and returns the manuscript. */
  const proposeAndAccept = async () => {
    const p = await ms(await req('POST', '/manuscript/proposals', {}));
    return ms(await req('POST', `/manuscript/proposals/${p.proposals[0]!.id}/accept`));
  };
  /** Registers a reviewer with the given rights. */
  const reviewer = async (rights: string[], email = `lektor${Math.random()}@example.de`) => {
    const r = await registeredAgent(app, email);
    const res = await req('POST', '/manuscript/reviewers', { email, rights });
    expect(res.statusCode).toBe(201);
    return { ...r, req: as(r.cookie) };
  };
  return { app, author, bookId, req, ms, proposeAndAccept, reviewer };
}

describe('AI structure proposal (AC-001, AC-003)', () => {
  test('the AI proposes chapters from storylines; accepting creates chapters and blocks with version 1', async () => {
    const { app, req, ms } = await setup();
    const res = await req('POST', '/manuscript/proposals', {});
    expect(res.statusCode).toBe(201);
    const p = (await ms(res)).proposals[0]!;
    expect(p.kind).toBe('initial');
    expect(p.chapters.map((c) => c.title)).toEqual(['Kapitel 1: Reise', 'Kapitel 2: Traum']);
    const accepted = await ms(await req('POST', `/manuscript/proposals/${p.id}/accept`));
    expect(accepted.proposals).toEqual([]);
    expect(accepted.chapters.map((c) => c.blocks.map((b) => b.title))).toEqual([['Ankunft', 'Abschied'], ['Traum']]);
    expect(accepted.chapters[0]!.blocks[0]!.sectionId).not.toBeNull();
    expect(accepted.chapters[1]!.blocks[0]!.storylineId).not.toBeNull();
    expect(accepted.chapters[0]!.blocks.every((b) => b.version === 1)).toBe(true);
    await app.close();
  });

  test('an adjustment keeps blocks and is only applied when the author accepts it; rejecting changes nothing', async () => {
    const { app, req, ms, proposeAndAccept } = await setup();
    const before = await proposeAndAccept();
    const adjust = (await ms(await req('POST', '/manuscript/proposals', { wish: 'umdrehen' }))).proposals[0]!;
    expect(adjust.kind).toBe('adjust');
    const rejected = await ms(await req('POST', `/manuscript/proposals/${adjust.id}/reject`));
    expect(rejected.chapters.map((c) => c.id)).toEqual(before.chapters.map((c) => c.id));
    expect((await req('POST', `/manuscript/proposals/${adjust.id}/accept`)).statusCode).toBe(409);
    const again = (await ms(await req('POST', '/manuscript/proposals', {}))).proposals[0]!;
    const accepted = await ms(await req('POST', `/manuscript/proposals/${again.id}/accept`));
    expect(accepted.chapters.map((c) => c.id)).toEqual([...before.chapters].reverse().map((c) => c.id));
    expect(accepted.chapters[1]!.blocks.map((b) => b.id)).toEqual(before.chapters[0]!.blocks.map((b) => b.id));
    await app.close();
  });

  test('without AI the proposal route is 503', async () => {
    const app = await testApp({ ai: null });
    const { cookie } = await registeredAgent(app);
    const book = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'B' } });
    const res = await app.inject({ method: 'POST', url: `/api/books/${book.json().book.id}/manuscript/proposals`, headers: { cookie }, payload: {} });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('editing Bausteine (AC-002, AC-004, AC-017, AC-021)', () => {
  test('edits create versions; all versions are kept and an old one can be restored', async () => {
    const { app, req, ms, proposeAndAccept } = await setup();
    const block = (await proposeAndAccept()).chapters[0]!.blocks[0]!;
    await req('PATCH', `/manuscript/blocks/${block.id}`, { baseVersion: 1, text: 'Erster Text' });
    const v3 = await ms(await req('PATCH', `/manuscript/blocks/${block.id}`, { baseVersion: 2, text: 'Zweiter Text' }));
    expect(v3.chapters[0]!.blocks[0]).toMatchObject({ text: 'Zweiter Text', version: 3 });
    expect((await req('PATCH', `/manuscript/blocks/${block.id}`, { baseVersion: 2, text: 'veraltet' })).statusCode).toBe(409);
    const versions = (await req('GET', `/manuscript/blocks/${block.id}/versions`)).json() as { version: number; text: string; reason: string }[];
    expect(versions.map((v) => [v.version, v.text, v.reason])).toEqual([[3, 'Zweiter Text', 'edit'], [2, 'Erster Text', 'edit'], [1, '', 'create']]);
    const restored = await ms(await req('POST', `/manuscript/blocks/${block.id}/versions/2/restore`));
    expect(restored.chapters[0]!.blocks[0]).toMatchObject({ text: 'Erster Text', version: 4 });
    await app.close();
  });

  test('blocks move within and across chapters', async () => {
    const { app, req, ms, proposeAndAccept } = await setup();
    const m = await proposeAndAccept();
    const [c1, c2] = m.chapters as [ManuscriptResponse['chapters'][number], ManuscriptResponse['chapters'][number]];
    const swapped = await ms(await req('POST', `/manuscript/blocks/${c1.blocks[1]!.id}/move`, { position: 0 }));
    expect(swapped.chapters[0]!.blocks.map((b) => b.title)).toEqual(['Abschied', 'Ankunft']);
    const moved = await ms(await req('POST', `/manuscript/blocks/${c1.blocks[0]!.id}/move`, { chapterId: c2.id, position: 1 }));
    expect(moved.chapters.map((c) => c.blocks.map((b) => b.title))).toEqual([['Abschied'], ['Traum', 'Ankunft']]);
    const chapterMoved = await ms(await req('POST', `/manuscript/chapters/${c2.id}/move`, { position: 0 }));
    expect(chapterMoved.chapters.map((c) => c.id)).toEqual([c2.id, c1.id]);
    await app.close();
  });

  test('soft delete with comment puts a block into the trash; it can be restored', async () => {
    const { app, req, ms, proposeAndAccept } = await setup();
    const block = (await proposeAndAccept()).chapters[0]!.blocks[0]!;
    const deleted = await ms(await req('DELETE', `/manuscript/blocks/${block.id}`, { comment: 'passt nicht' }));
    expect(deleted.chapters[0]!.blocks.map((b) => b.title)).toEqual(['Abschied']);
    expect(deleted.trash).toEqual([expect.objectContaining({ kind: 'block', id: block.id, comment: 'passt nicht', chapterTitle: 'Kapitel 1: Reise' })]);
    const restored = await ms(await req('POST', `/manuscript/blocks/${block.id}/restore`));
    expect(restored.trash).toEqual([]);
    expect(restored.chapters[0]!.blocks.map((b) => b.title)).toEqual(['Abschied', 'Ankunft']);
    await app.close();
  });

  test('a deleted chapter hides its blocks and comes back with them', async () => {
    const { app, req, ms, proposeAndAccept } = await setup();
    const c1 = (await proposeAndAccept()).chapters[0]!;
    const deleted = await ms(await req('DELETE', `/manuscript/chapters/${c1.id}`));
    expect(deleted.chapters.map((c) => c.title)).toEqual(['Kapitel 2: Traum']);
    expect(deleted.trash[0]).toMatchObject({ kind: 'chapter', id: c1.id, comment: null });
    const restored = await ms(await req('POST', `/manuscript/chapters/${c1.id}/restore`));
    expect(restored.chapters.at(-1)!.blocks).toHaveLength(2);
    await app.close();
  });

  test('the AI draft returns text without saving it', async () => {
    const { app, req, ms, proposeAndAccept } = await setup();
    const block = (await proposeAndAccept()).chapters[0]!.blocks[0]!;
    const res = await req('POST', `/manuscript/blocks/${block.id}/draft`);
    expect(res.json()).toEqual({ text: 'KI-Entwurf: Ankunft' });
    expect((await ms(await req('GET', '/manuscript'))).chapters[0]!.blocks[0]!.version).toBe(1);
    await app.close();
  });
});

describe('reviewers (AC-005, AC-018)', () => {
  test('at most 5 reviewers; rights are individual and always include read', async () => {
    const { app, req, reviewer } = await setup();
    for (let i = 0; i < 5; i++) await reviewer(['edit']);
    await registeredAgent(app, 'sechs@example.de');
    const sixth = await req('POST', '/manuscript/reviewers', { email: 'sechs@example.de', rights: [] });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json()).toEqual({ error: 'too_many_reviewers' });
    const list = (await req('GET', '/manuscript')).json().reviewers as { rights: string[] }[];
    expect(list).toHaveLength(5);
    expect(list[0]!.rights).toEqual(['read', 'edit']);
    expect((await req('POST', '/manuscript/reviewers', { email: 'niemand@example.de', rights: [] })).json()).toEqual({ error: 'user_not_found' });
    await app.close();
  });

  test('a reader can read but not change; rights can be widened and revoked', async () => {
    const { app, req, proposeAndAccept, reviewer, bookId } = await setup();
    const block = (await proposeAndAccept()).chapters[0]!.blocks[0]!;
    const r = await reviewer([]);
    const read = await r.req('GET', '/manuscript');
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ role: 'reviewer', rights: ['read'], reviewers: [], proposals: [] });
    expect((await r.req('PATCH', `/manuscript/blocks/${block.id}`, { baseVersion: 1, text: 'x' })).statusCode).toBe(403);
    expect((await r.req('DELETE', `/manuscript/blocks/${block.id}`)).statusCode).toBe(403);
    expect((await r.req('POST', `/manuscript/blocks/${block.id}/move`, { position: 1 })).statusCode).toBe(403);
    expect((await r.req('POST', '/manuscript/proposals', {})).statusCode).toBe(403);
    expect((await r.req('GET', '')).statusCode).toBe(404); // the storyline map stays the author's
    const reviews = await app.inject({ method: 'GET', url: '/api/reviews', headers: { cookie: r.cookie } });
    expect(reviews.json()).toEqual([{ id: bookId, title: 'Roman', ownerName: 'Autor', rights: ['read'] }]);
    await req('PATCH', `/manuscript/reviewers/${r.userId}`, { rights: ['edit', 'delete'] });
    expect((await r.req('PATCH', `/manuscript/blocks/${block.id}`, { baseVersion: 1, text: 'Lektor' })).statusCode).toBe(200);
    expect((await r.req('DELETE', `/manuscript/blocks/${block.id}`)).statusCode).toBe(200);
    await req('DELETE', `/manuscript/reviewers/${r.userId}`);
    expect((await r.req('GET', '/manuscript')).statusCode).toBe(404);
    await app.close();
  });
});

describe('locks (AC-006 .. AC-009, AC-011, EC-001)', () => {
  test('a lock blocks others, shows only that it is locked, and the author can release it', async () => {
    const { app, req, ms, proposeAndAccept, reviewer } = await setup();
    const block = (await proposeAndAccept()).chapters[0]!.blocks[0]!;
    const r = await reviewer(['edit', 'delete']);
    const locked = await ms(await r.req('POST', `/manuscript/blocks/${block.id}/lock`));
    expect(locked.chapters[0]!.blocks[0]!.lock).toMatchObject({ mine: true });
    const seen = (await ms(await req('GET', '/manuscript'))).chapters[0]!.blocks[0]!.lock!;
    expect(Object.keys(seen).sort()).toEqual(['expiresAt', 'mine']);
    expect(seen.mine).toBe(false);
    const blocked = await req('PATCH', `/manuscript/blocks/${block.id}`, { baseVersion: 1, text: 'Autorin' });
    expect(blocked.statusCode).toBe(423);
    expect(blocked.json()).toEqual({ error: 'locked' });
    expect((await req('POST', `/manuscript/blocks/${block.id}/lock`)).statusCode).toBe(423);
    const released = await ms(await req('DELETE', `/manuscript/blocks/${block.id}/lock`));
    expect(released.chapters[0]!.blocks[0]!.lock).toBeNull();
    // EC-002: the reviewer's unsaved change can still be saved while nobody else holds the lock.
    expect((await r.req('PATCH', `/manuscript/blocks/${block.id}`, { baseVersion: 1, text: 'Lektor' })).statusCode).toBe(200);
    await app.close();
  });

  test('a reviewer cannot release a foreign lock', async () => {
    const { app, req, proposeAndAccept, reviewer } = await setup();
    const block = (await proposeAndAccept()).chapters[0]!.blocks[0]!;
    const r = await reviewer(['edit']);
    await req('POST', `/manuscript/blocks/${block.id}/lock`);
    expect((await r.req('DELETE', `/manuscript/blocks/${block.id}/lock`)).statusCode).toBe(403);
    await app.close();
  });

  test('a lock runs out after 30 minutes regardless of activity', async () => {
    const { app, req, ms, proposeAndAccept, reviewer } = await setup();
    const block = (await proposeAndAccept()).chapters[0]!.blocks[0]!;
    const r = await reviewer(['edit']);
    await r.req('POST', `/manuscript/blocks/${block.id}/lock`);
    await r.req('POST', `/manuscript/blocks/${block.id}/lock`); // re-taking does not extend it
    await app.db.update(blocks).set({ lockedAt: new Date(Date.now() - 31 * 60_000) }).where(eq(blocks.id, block.id));
    expect((await ms(await req('GET', '/manuscript'))).chapters[0]!.blocks[0]!.lock).toBeNull();
    expect((await req('POST', `/manuscript/blocks/${block.id}/lock`)).statusCode).toBe(200);
    await app.close();
  });
});
