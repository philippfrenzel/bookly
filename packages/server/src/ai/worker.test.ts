/** Integration tests for the character check queue and worker. */
import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Id } from '@bookly/shared';
import { loadBook } from '../db/loadBook.js';
import { characterChecks, characterWarnings, characters, storylineCharacters, storylines } from '../db/schema.js';
import { registeredAgent, testApp } from '../test/helpers.js';
import { seedCharacter, seedStoryline, seedTimePoints } from '../test/fixtures.js';
import { AiError, type AiClient } from './client.js';
import { enqueueChanged, enqueueForced } from './queue.js';
import { createCheckWorker } from './worker.js';

/** Fake AI client: counts calls and delegates each reply to a replaceable handler. */
interface FakeAi extends AiClient {
  calls: number;
  reply: () => Promise<unknown>;
}

function fakeAi(): FakeAi {
  const ai: FakeAi = {
    model: 'fake-model',
    calls: 0,
    reply: async () => ({ warnings: [] }),
    async complete() {
      ai.calls++;
      return ai.reply();
    },
  };
  return ai;
}

const silent = {
  level: 'silent',
  fatal() {}, error() {}, warn() {}, info() {}, debug() {}, trace() {}, silent() {},
  child() { return silent; },
} as unknown as FastifyBaseLogger;

interface Setup { app: FastifyInstance; bookId: Id; storylineId: Id; charId: Id; ai: FakeAi }

/** Book with one storyline that has one assigned character. */
async function setup(): Promise<Setup> {
  const app = await testApp();
  const { cookie } = await registeredAgent(app);
  const res = await app.inject({ method: 'POST', url: '/api/books', headers: { cookie }, payload: { title: 'Roman' } });
  const bookId: Id = res.json().book.id;
  const [t0, , t2] = await seedTimePoints(app, bookId);
  const storylineId = await seedStoryline(app, bookId, t0!, t2!, 'A');
  const charId = await seedCharacter(app, bookId, 'Anna');
  await app.db.insert(storylineCharacters).values({ storylineId, characterId: charId });
  return { app, bookId, storylineId, charId, ai: fakeAi() };
}

async function enqueue(s: Setup): Promise<void> {
  await enqueueChanged(s.app.db, await loadBook(s.app.db, s.bookId), s.ai.model);
}

async function checkRow(s: Setup) {
  const [row] = await s.app.db.select().from(characterChecks).where(eq(characterChecks.storylineId, s.storylineId));
  return row;
}

async function warningRows(s: Setup) {
  return s.app.db.select().from(characterWarnings).where(eq(characterWarnings.storylineId, s.storylineId));
}

function worker(s: Setup, quietMs = 0) {
  return createCheckWorker({ db: s.app.db, ai: s.ai, log: silent, quietMs });
}

async function editStoryline(s: Setup, description: string): Promise<void> {
  await s.app.db.update(storylines).set({ description }).where(eq(storylines.id, s.storylineId));
}

describe('character check worker', () => {
  test('processes a pending check', async () => {
    const s = await setup();
    s.ai.reply = async () => ({ warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'Anna wirkt anders.' }] });
    await enqueue(s);
    expect((await checkRow(s))?.status).toBe('pending');
    expect(await worker(s).runOnce()).toBe(1);
    const row = await checkRow(s);
    expect(row).toMatchObject({ status: 'done', model: 'fake-model', error: null });
    expect(row?.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.finishedAt).toBeInstanceOf(Date);
    expect(await warningRows(s)).toEqual([
      expect.objectContaining({ characterId: s.charId, criterion: 'behavior_change', message: 'Anna wirkt anders.' }),
    ]);
    expect(s.ai.calls).toBe(1);
    await s.app.close();
  });

  test('skips unchanged input', async () => {
    const s = await setup();
    const w = worker(s);
    await enqueue(s);
    await w.runOnce();
    const before = await checkRow(s);
    await enqueue(s);
    expect(await checkRow(s)).toEqual(before);
    expect(await w.runOnce()).toBe(0);
    expect(s.ai.calls).toBe(1);
    await s.app.close();
  });

  test('coalesces rapid enqueues', async () => {
    const s = await setup();
    await enqueue(s);
    const first = (await checkRow(s))!.requestedAt;
    await editStoryline(s, 'eins');
    await enqueue(s);
    await editStoryline(s, 'zwei');
    await enqueue(s);
    expect((await checkRow(s))!.requestedAt.getTime()).toBeGreaterThan(first.getTime());
    const rows = await s.app.db.select().from(characterChecks);
    expect(rows).toEqual([expect.objectContaining({ storylineId: s.storylineId, status: 'pending' })]);
    expect(await worker(s, 5000).runOnce()).toBe(0);
    expect(s.ai.calls).toBe(0);
    await s.app.close();
  });

  test('failed run keeps previous warnings', async () => {
    const s = await setup();
    const w = worker(s);
    s.ai.reply = async () => ({ warnings: [{ characterId: s.charId, criterion: 'intention_conflict', message: 'Alt.' }] });
    await enqueue(s);
    await w.runOnce();
    await editStoryline(s, 'geändert');
    await enqueue(s);
    s.ai.reply = async () => { throw new AiError('AI request timed out'); };
    expect(await w.runOnce()).toBe(1);
    expect(await checkRow(s)).toMatchObject({ status: 'failed', error: 'AI request timed out' });
    expect(await warningRows(s)).toEqual([expect.objectContaining({ message: 'Alt.' })]);
    await s.app.close();
  });

  test('re-queues when input changed during run', async () => {
    const s = await setup();
    s.ai.reply = async () => {
      await editStoryline(s, 'während der Prüfung geändert');
      await enqueue(s);
      return { warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'Neu.' }] };
    };
    await enqueue(s);
    expect(await worker(s).runOnce()).toBe(1);
    expect((await checkRow(s))?.status).toBe('pending');
    expect(await warningRows(s)).toHaveLength(1);
    await s.app.close();
  });

  test('skips vanished storyline', async () => {
    const s = await setup();
    await enqueue(s);
    await s.app.db.delete(storylines).where(eq(storylines.id, s.storylineId));
    expect(await worker(s).runOnce()).toBe(0);
    expect(s.ai.calls).toBe(0);
    expect(await s.app.db.select().from(characterChecks)).toEqual([]);
    await s.app.close();
  });

  test('check cleared during run writes no warnings', async () => {
    const s = await setup();
    s.ai.reply = async () => {
      await s.app.db.delete(storylineCharacters).where(eq(storylineCharacters.storylineId, s.storylineId));
      await enqueue(s);
      return { warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'Verwaist.' }] };
    };
    await enqueue(s);
    expect(await worker(s).runOnce()).toBe(1);
    expect(await checkRow(s)).toBeUndefined();
    expect(await warningRows(s)).toEqual([]);
    await s.app.close();
  });

  test('check re-created during run is not overwritten by done', async () => {
    const s = await setup();
    s.ai.reply = async () => {
      await s.app.db.delete(characterChecks).where(eq(characterChecks.storylineId, s.storylineId));
      await enqueueForced(s.app.db, [s.storylineId]);
      return { warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'Veraltet.' }] };
    };
    await enqueue(s);
    expect(await worker(s).runOnce()).toBe(1);
    expect(await checkRow(s)).toMatchObject({ status: 'pending', finishedAt: null, error: null });
    expect(await warningRows(s)).toEqual([]);
    await s.app.close();
  });

  test('check re-created during run is not overwritten by failed', async () => {
    const s = await setup();
    s.ai.reply = async () => {
      await s.app.db.delete(characterChecks).where(eq(characterChecks.storylineId, s.storylineId));
      await enqueueForced(s.app.db, [s.storylineId]);
      throw new AiError('AI request failed');
    };
    await enqueue(s);
    expect(await worker(s).runOnce()).toBe(1);
    expect(await checkRow(s)).toMatchObject({ status: 'pending', finishedAt: null, error: null });
    await s.app.close();
  });

  test('check re-claimed during run keeps only the second result', async () => {
    const s = await setup();
    const second = fakeAi();
    let release!: () => void;
    let secondJob!: Promise<number>;
    const secondStarted = new Promise<void>((resolve) => {
      second.reply = () => {
        resolve();
        return new Promise((r) => {
          release = () => r({ warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'Zweiter.' }] });
        });
      };
    });
    s.ai.reply = async () => {
      await s.app.db.delete(characterChecks).where(eq(characterChecks.storylineId, s.storylineId));
      await enqueueForced(s.app.db, [s.storylineId]);
      secondJob = createCheckWorker({ db: s.app.db, ai: second, log: silent, quietMs: 0 }).runOnce();
      await secondStarted;
      return { warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'Erster.' }] };
    };
    await enqueue(s);
    expect(await worker(s).runOnce()).toBe(1);
    expect((await checkRow(s))?.status).toBe('running');
    expect(await warningRows(s)).toEqual([]);
    release();
    expect(await secondJob).toBe(1);
    expect((await checkRow(s))?.status).toBe('done');
    expect(await warningRows(s)).toEqual([expect.objectContaining({ message: 'Zweiter.' })]);
    await s.app.close();
  });

  test('claimed check without input is removed with its warnings', async () => {
    const s = await setup();
    await s.app.db.insert(characterChecks).values({ storylineId: s.storylineId, status: 'pending', requestedAt: new Date(Date.now() - 60_000) });
    await s.app.db.insert(characterWarnings).values({ storylineId: s.storylineId, characterId: s.charId, criterion: 'behavior_change', message: 'Alt.' });
    await s.app.db.delete(storylineCharacters).where(eq(storylineCharacters.storylineId, s.storylineId));
    expect(await worker(s).runOnce()).toBe(1);
    expect(await checkRow(s)).toBeUndefined();
    expect(await warningRows(s)).toEqual([]);
    expect(s.ai.calls).toBe(0);
    await s.app.close();
  });

  test('two workers claim a check only once', async () => {
    const s = await setup();
    await enqueue(s);
    const counts = await Promise.all([worker(s).runOnce(), worker(s).runOnce()]);
    expect(counts[0]! + counts[1]!).toBe(1);
    expect(s.ai.calls).toBe(1);
    await s.app.close();
  });

  test('storyline deleted during run leaves nothing behind', async () => {
    const s = await setup();
    s.ai.reply = async () => {
      await s.app.db.delete(storylines).where(eq(storylines.id, s.storylineId));
      return { warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'Weg.' }] };
    };
    await enqueue(s);
    expect(await worker(s).runOnce()).toBe(1);
    expect(await s.app.db.select().from(characterChecks)).toEqual([]);
    expect(await s.app.db.select().from(characterWarnings)).toEqual([]);
    await s.app.close();
  });

  test('drops warnings for deleted character', async () => {
    const s = await setup();
    const otherId = await seedCharacter(s.app, s.bookId, 'Jakob');
    await s.app.db.insert(storylineCharacters).values({ storylineId: s.storylineId, characterId: otherId });
    s.ai.reply = async () => {
      await s.app.db.delete(characters).where(eq(characters.id, otherId));
      return {
        warnings: [
          { characterId: s.charId, criterion: 'behavior_change', message: 'Anna.' },
          { characterId: otherId, criterion: 'relationship_conflict', message: 'Jakob.' },
        ],
      };
    };
    await enqueue(s);
    expect(await worker(s).runOnce()).toBe(1);
    expect(await warningRows(s)).toEqual([expect.objectContaining({ characterId: s.charId, message: 'Anna.' })]);
    await s.app.close();
  });

  test('failed check is not retried automatically', async () => {
    const s = await setup();
    const w = worker(s);
    s.ai.reply = async () => { throw new AiError('AI request failed'); };
    await enqueue(s);
    await w.runOnce();
    await enqueue(s);
    expect((await checkRow(s))?.status).toBe('failed');
    expect(await w.runOnce()).toBe(0);
    expect(s.ai.calls).toBe(1);
    await s.app.close();
  });

  test('forced enqueue re-runs unchanged input', async () => {
    const s = await setup();
    const w = worker(s);
    await enqueue(s);
    await w.runOnce();
    await enqueueForced(s.app.db, [s.storylineId]);
    expect((await checkRow(s))?.status).toBe('pending');
    expect(await w.runOnce()).toBe(1);
    expect(s.ai.calls).toBe(2);
    await s.app.close();
  });

  test('storyline without characters loses its check and warnings', async () => {
    const s = await setup();
    s.ai.reply = async () => ({ warnings: [{ characterId: s.charId, criterion: 'behavior_change', message: 'X.' }] });
    await enqueue(s);
    await worker(s).runOnce();
    await s.app.db.delete(storylineCharacters).where(eq(storylineCharacters.storylineId, s.storylineId));
    await enqueue(s);
    expect(await checkRow(s)).toBeUndefined();
    expect(await warningRows(s)).toEqual([]);
    await s.app.close();
  });

  test('start resets stale running checks and stop awaits in-flight jobs', async () => {
    const s = await setup();
    await s.app.db.insert(characterChecks).values({
      storylineId: s.storylineId, status: 'running', requestedAt: new Date(Date.now() - 600_000), startedAt: new Date(Date.now() - 600_000),
    });
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      s.ai.reply = () => {
        resolve();
        return new Promise((r) => { release = () => r({ warnings: [] }); });
      };
    });
    const w = createCheckWorker({ db: s.app.db, ai: s.ai, log: silent, quietMs: 0, pollMs: 10 });
    w.start();
    await started;
    const stopping = w.stop();
    release();
    await stopping;
    expect((await checkRow(s))?.status).toBe('done');
    expect(s.ai.calls).toBe(1);
    await s.app.close();
  });
});
