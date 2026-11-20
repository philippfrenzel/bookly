/** In-process worker that claims pending character checks, calls the model and stores warnings. */
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Id } from '@bookly/shared';
import type { Db } from '../db/client.js';
import { loadBook } from '../db/loadBook.js';
import { characterChecks, characterWarnings, characters, storylines } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { buildCheckInput, checkRequest, inputHash, parseCheckResponse, type ParsedWarning } from './checkPrompt.js';
import { AiError, type AiClient } from './client.js';

/** Options of the check worker; defaults: poll 2 s, quiet period 5 s, 2 concurrent jobs. */
export interface CheckWorkerOptions {
  db: Db;
  ai: AiClient;
  log: FastifyBaseLogger;
  pollMs?: number;
  quietMs?: number;
  concurrency?: number;
}

/** Handle of a running check worker. */
export interface CheckWorker {
  start(): void;
  stop(): Promise<void>;
  runOnce(): Promise<number>;
}

const STALE_SECS = 5 * 60;

/** A claimed check: its storyline and the exact `started_at` the claim wrote (text, full precision). */
interface Claim { storylineId: Id; claimedAt: string }

/** Matches the check row only while it is still held by this claim (`running`, same `started_at`). */
function isClaimed({ storylineId, claimedAt }: Claim) {
  return and(
    eq(characterChecks.storylineId, storylineId),
    eq(characterChecks.status, 'running'),
    sql`${characterChecks.startedAt} = ${claimedAt}::timestamptz`,
  );
}

/** Creates a worker; `runOnce` claims and processes one batch and resolves with the job count. */
export function createCheckWorker(opts: CheckWorkerOptions): CheckWorker {
  const { db, ai, log } = opts;
  const pollMs = opts.pollMs ?? 2000;
  const quietSecs = (opts.quietMs ?? 5000) / 1000;
  const concurrency = opts.concurrency ?? 2;
  const inFlight = new Set<Promise<void>>();
  let running = false;
  let timer: NodeJS.Timeout | null = null;
  let ticking: Promise<unknown> = Promise.resolve();

  /** Atomically marks up to `n` quiet pending checks as running and returns the claims. */
  async function claim(n: number): Promise<Claim[]> {
    const rows = await db.execute<{ storyline_id: Id; claimed_at: string }>(sql`
      UPDATE character_checks SET status = 'running', started_at = now()
      WHERE storyline_id IN (
        SELECT storyline_id FROM character_checks
        WHERE status = 'pending' AND requested_at <= now() - make_interval(secs => ${quietSecs}::double precision)
        ORDER BY requested_at
        LIMIT ${n}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING storyline_id, started_at::text AS claimed_at`);
    return rows.map((r) => ({ storylineId: r.storyline_id, claimedAt: r.claimed_at }));
  }

  /** Replaces the storyline's warnings and marks the check done, keeping only existing characters. */
  async function saveResult(job: Claim, bookId: Id, warnings: ParsedWarning[]): Promise<void> {
    const { storylineId } = job;
    await db.transaction(async (tx) => {
      // Share locks keep the storyline and characters from vanishing before the insert.
      const [line] = await tx.select({ id: storylines.id }).from(storylines).where(eq(storylines.id, storylineId)).for('share');
      if (!line) return;
      // The check row may have been cleared, re-created or re-claimed while the model ran: then this result is stale.
      const [check] = await tx.select({ id: characterChecks.storylineId }).from(characterChecks)
        .where(isClaimed(job)).for('update');
      if (!check) return;
      const ids = [...new Set(warnings.map((w) => w.characterId))];
      const existing = ids.length
        ? await tx.select({ id: characters.id }).from(characters)
            .where(and(eq(characters.bookId, bookId), inArray(characters.id, ids))).for('share')
        : [];
      const keep = new Set(existing.map((c) => c.id));
      await tx.delete(characterWarnings).where(eq(characterWarnings.storylineId, storylineId));
      const rows = warnings.filter((w) => keep.has(w.characterId)).map((w) => ({ storylineId, ...w }));
      if (rows.length) await tx.insert(characterWarnings).values(rows);
      await tx.update(characterChecks)
        .set({ status: 'done', finishedAt: new Date(), error: null })
        .where(isClaimed(job));
    });
  }

  /** Sets the check back to pending when the storyline's input changed since `hash` was attempted. */
  async function requeueIfChanged(storylineId: Id, bookId: Id, hash: string): Promise<void> {
    let current: string | null = null;
    try {
      const input = buildCheckInput(await loadBook(db, bookId), storylineId);
      current = input ? inputHash(input, ai.model) : null;
    } catch (err) {
      if (err instanceof NotFoundError) return;
      throw err;
    }
    if (current === hash) return;
    await db.update(characterChecks)
      .set({ status: 'pending', requestedAt: sql`now()` })
      .where(and(eq(characterChecks.storylineId, storylineId), ne(characterChecks.status, 'running')));
  }

  /** Runs one claimed check; never rejects. */
  async function runJob(job: Claim): Promise<void> {
    const { storylineId } = job;
    let bookId: Id | undefined;
    let hash: string | undefined;
    try {
      const [line] = await db.select({ bookId: storylines.bookId }).from(storylines).where(eq(storylines.id, storylineId));
      if (!line) return; // storyline gone, its check row went with it
      bookId = line.bookId;
      const input = buildCheckInput(await loadBook(db, bookId), storylineId);
      if (!input) {
        const gone = await db.delete(characterChecks).where(isClaimed(job)).returning({ id: characterChecks.storylineId });
        if (gone.length) await db.delete(characterWarnings).where(eq(characterWarnings.storylineId, storylineId));
        return;
      }
      hash = inputHash(input, ai.model);
      await db.update(characterChecks).set({ inputHash: hash, model: ai.model }).where(isClaimed(job));
      const warnings = parseCheckResponse(await ai.complete(checkRequest(input)), input);
      await saveResult(job, bookId, warnings);
    } catch (err) {
      if (err instanceof NotFoundError) return; // book deleted meanwhile
      log.warn({ err, storylineId }, 'character check failed');
      const error = err instanceof AiError ? err.message : 'check failed';
      await db.update(characterChecks)
        .set({ status: 'failed', finishedAt: new Date(), error: error.slice(0, 200) })
        .where(isClaimed(job))
        .catch((e: unknown) => log.error({ err: e, storylineId }, 'could not mark character check failed'));
    }
    if (bookId && hash) {
      await requeueIfChanged(storylineId, bookId, hash)
        .catch((err: unknown) => log.error({ err, storylineId }, 'could not re-queue character check'));
    }
  }

  /** Starts a job and tracks it until it settles. */
  function launch(claimed: Claim): Promise<void> {
    const job = runJob(claimed).finally(() => inFlight.delete(job));
    inFlight.add(job);
    return job;
  }

  /** Claims as many jobs as there are free slots and launches them. */
  async function claimAndLaunch(): Promise<Promise<void>[]> {
    const free = concurrency - inFlight.size;
    if (free <= 0) return [];
    return (await claim(free)).map(launch);
  }

  /** One poll: claim and launch without waiting for the jobs. */
  async function tick(): Promise<void> {
    try {
      await claimAndLaunch();
    } catch (err) {
      log.error({ err }, 'character check poll failed');
    }
  }

  /** Schedules the next poll unless stopped. */
  function schedule(): void {
    if (!running) return;
    timer = setTimeout(() => {
      timer = null;
      ticking = tick().finally(schedule);
    }, pollMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      ticking = db
        .execute(sql`
          UPDATE character_checks SET status = 'pending'
          WHERE status = 'running' AND started_at < now() - make_interval(secs => ${STALE_SECS}::double precision)`)
        .catch((err: unknown) => log.error({ err }, 'could not reset stale character checks'))
        .then(tick)
        .finally(schedule);
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      await ticking;
      await Promise.all(inFlight);
    },
    async runOnce() {
      const jobs = await claimAndLaunch();
      await Promise.all(jobs);
      return jobs.length;
    },
  };
}
