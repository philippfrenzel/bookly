/** Integration tests for the magic wand on a manuscript Baustein: context, mentions, target checks, long texts. */
import { describe, expect, test } from 'vitest';
import type { ManuscriptResponse } from '@bookly/shared';
import type { AiClient, AiRequest } from '../ai/client.js';
import { createFakeAiClient } from '../ai/fake.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedTimePoints } from '../test/fixtures.js';
import { CONTINUE_TAIL } from './aiText.js';

/** An author with one Baustein and the character Lena; the AI is the fake client behind a recording spy. */
async function setup() {
  const fake = createFakeAiClient();
  const calls: AiRequest[] = [];
  const ai: AiClient = { model: 'spy', complete: async (r) => { calls.push(r); return fake.complete(r); } };
  const app = await testApp({ ai });
  const { cookie } = await registeredAgent(app);
  const bookId: string = (await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } })).json().book.id;
  const tps = await seedTimePoints(app, bookId, ['T0', 'T1']);
  const req = (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object) =>
    app.inject({ method, url: `/api/books/${bookId}${path}`, headers: { cookie }, ...(payload !== undefined && { payload }) });
  await req('POST', '/characters', { name: 'Lena', description: 'Fischerin' });
  const line = await req('POST', '/storylines', { title: 'Reise', kind: 'main', range: { startId: tps[0], endId: tps[1] } });
  const storylineId: string = line.json().book.storylines[0].id;
  await req('POST', `/storylines/${storylineId}/sections`, { title: 'Ankunft', range: { startId: tps[0], endId: tps[1] } });
  const proposal = (await req('POST', '/manuscript/proposals', {})).json() as ManuscriptResponse;
  const accepted = (await req('POST', `/manuscript/proposals/${proposal.proposals[0]!.id}/accept`)).json() as ManuscriptResponse;
  const blockId = accepted.chapters[0]!.blocks[0]!.id;
  calls.length = 0;
  const wand = (body: object, id = blockId) => req('POST', `/manuscript/blocks/${id}/ai-text`, body);
  const target = (field: 'text' | 'synopsis' = 'text') => ({ kind: 'manuscriptBlock', blockId, field });
  return { app, req, calls, wand, target, blockId, accepted };
}

const user = (r: AiRequest) => JSON.parse(r.user) as { text: string; kontext: Record<string, unknown> };

describe('manuscript wand', () => {
  test('answers with suggestions; the model sees chapter, block, the block rule and the named characters', async () => {
    const { app, calls, wand, target, accepted } = await setup();
    const text = 'Lena stand am Steg und sah aufs Wasser.';
    const res = await wand({ target: target(), action: 'instruct', instruction: 'kürzer', text, selection: { start: 0, end: 20 }, draft: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().suggestions).toHaveLength(3);
    expect(calls[0]!.system).toContain('Baustein eines Romanmanuskripts');
    const k = user(calls[0]!).kontext;
    expect(k.kapitel).toBe(accepted.chapters[0]!.title);
    expect(k.baustein).toBe(accepted.chapters[0]!.blocks[0]!.title);
    expect(k.erwaehnt).toEqual([{ name: 'Lena', beschreibung: 'Fischerin', verhalten: '', absichten: '' }]);
    await app.close();
  });

  test('the manuscript lists the named characters for "@"', async () => {
    const { app, req } = await setup();
    const ms = (await req('GET', '/manuscript')).json() as ManuscriptResponse;
    expect(ms.context.characters.map((c) => c.name)).toEqual(['Lena']);
    await app.close();
  });

  test('continue on a long block sends only its end', async () => {
    const { app, calls, wand, target } = await setup();
    const text = `${'Wort '.repeat(2000)}Ende.`;
    const res = await wand({ target: target(), action: 'continue', text, selection: null, draft: {} });
    expect(res.statusCode).toBe(200);
    expect(user(calls[0]!).text).toHaveLength(CONTINUE_TAIL);
    await app.close();
  });

  test('a target of another block or kind is 400; the general route does not serve manuscript blocks', async () => {
    const { app, calls, wand, req, target } = await setup();
    const body = { target: { kind: 'storyline', storylineId: null, field: 'description' }, action: 'polish', text: 'Ein Satz hier.', selection: null, draft: {} };
    expect((await wand(body)).statusCode).toBe(400);
    expect((await req('POST', '/ai/text', { ...body, target: target() })).statusCode).toBe(404);
    expect(calls).toHaveLength(0);
    await app.close();
  });
});
