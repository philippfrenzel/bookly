/** Integration tests for the AI draft of a Baustein: optional length choice and the book's word range. */
import { describe, expect, test } from 'vitest';
import type { ManuscriptResponse } from '@bookly/shared';
import type { AiClient, AiRequest } from '../ai/client.js';
import { createFakeAiClient } from '../ai/fake.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedTimePoints } from '../test/fixtures.js';

/** An author with one storyline section turned into a Baustein; the AI is the fake client behind a recording spy. */
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
  const line = await req('POST', '/storylines', { title: 'Reise', kind: 'main', range: { startId: tps[0], endId: tps[1] } });
  const storylineId: string = line.json().book.storylines[0].id;
  await req('POST', `/storylines/${storylineId}/sections`, { title: 'Ankunft', range: { startId: tps[0], endId: tps[1] } });
  const proposal = (await req('POST', '/manuscript/proposals', {})).json() as ManuscriptResponse;
  const accepted = (await req('POST', `/manuscript/proposals/${proposal.proposals[0]!.id}/accept`)).json() as ManuscriptResponse;
  const blockId = accepted.chapters[0]!.blocks[0]!.id;
  calls.length = 0;
  return { app, req, calls, draft: (body?: object) => req('POST', `/manuscript/blocks/${blockId}/draft`, body) };
}

describe('AI draft length', () => {
  test('without body the old prompt span is used', async () => {
    const { app, calls, draft } = await setup();
    const res = await draft();
    expect(res.statusCode).toBe(200);
    expect(calls[0]!.system).toContain('Etwa 300 bis 600 Wörter.');
    await app.close();
  });

  test('length short with a book range reaches the model as "knapp"', async () => {
    const { app, req, calls, draft } = await setup();
    expect((await req('PATCH', '', { targetWords: { min: 60000, max: 90000 } })).statusCode).toBe(200);
    const res = await draft({ length: 'short' });
    expect(res.statusCode).toBe(200);
    expect(calls[0]!.system).toContain('60000–90000');
    expect(calls[0]!.system).toContain('knapp');
    await app.close();
  });

  test('an invalid length is 400 invalid_body and the AI is not called', async () => {
    const { app, calls, draft } = await setup();
    const res = await draft({ length: 'riesig' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    expect(calls).toHaveLength(0);
    await app.close();
  });
});
