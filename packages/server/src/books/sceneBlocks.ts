/** Text blocks of scene assignments: the atomic "replace all blocks" route and the shared block writer. */
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { descriptionToBlocks, joinBlocks, SCENE_BLOCK_LIMITS, SceneBlocksBody, UUID_RE } from '@bookly/shared';
import type { Id } from '@bookly/shared';
import { requireUser } from '../auth/session.js';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import { sceneAssignmentBlocks, sceneAssignments, scenes } from '../db/schema.js';
import { NotFoundError } from '../errors.js';
import { bookGuard } from './guard.js';

/** Thrown inside a mutation when the caller's revision is not the stored one; maps to 409 `stale`. */
export class StaleRevision extends Error {
  constructor() {
    super('stale revision');
  }
}

/** Thrown inside a mutation when a block id does not belong to the assignment; maps to 400 `unknown_block`. */
export class UnknownBlock extends Error {
  constructor() {
    super('unknown block');
  }
}

/** Throws NotFoundError unless `assignmentId` is an assignment of a scene in `bookId`. */
export async function assertAssignmentInBook(db: Db, assignmentId: string, bookId: Id): Promise<void> {
  if (!UUID_RE.test(assignmentId)) throw new NotFoundError();
  const [row] = await db
    .select({ id: sceneAssignments.id })
    .from(sceneAssignments)
    .innerJoin(scenes, eq(scenes.id, sceneAssignments.sceneId))
    .where(and(eq(sceneAssignments.id, assignmentId), eq(scenes.bookId, bookId)));
  if (!row) throw new NotFoundError();
}

/**
 * Throws StaleRevision unless the assignment's stored revision equals `revision`, and NotFoundError when the
 * assignment is gone (e.g. deleted by another request since the route's check). Call inside the book mutation.
 */
export async function assertRevision(tx: Tx, assignmentId: Id, revision: number): Promise<void> {
  const [row] = await tx.select({ revision: sceneAssignments.revision }).from(sceneAssignments).where(eq(sceneAssignments.id, assignmentId));
  if (!row) throw new NotFoundError();
  if (row.revision !== revision) throw new StaleRevision();
}

/**
 * The blocks a whole description („Zuordnen“, „Übernehmen“) is stored as (descriptionToBlocks, exact
 * round-trip with joinBlocks); null when a block would exceed the block text limit, so nothing is written.
 */
export function descriptionBlocks(description: string): { text: string }[] | null {
  const texts = descriptionToBlocks(description);
  if (texts.some((t) => t.length > SCENE_BLOCK_LIMITS.text)) return null;
  return texts.map((text) => ({ text }));
}

/**
 * Replaces the ordered blocks of an assignment: blocks omitted from `texts` are deleted, given ids keep
 * their identity, blocks without id are new; positions follow the array order. Also sets the derived
 * `description` (joinBlocks), `updatedAt` and bumps `revision`. Throws UnknownBlock when an id belongs to
 * another assignment. All rows are deleted and reinserted, so the (assignment, position) index never sees a
 * transient duplicate. Must run inside the book mutation (row lock serialises writers).
 */
export async function writeBlocks(tx: Tx, assignmentId: Id, texts: { id?: Id; text: string }[]): Promise<void> {
  const existing = await tx
    .select({ id: sceneAssignmentBlocks.id })
    .from(sceneAssignmentBlocks)
    .where(eq(sceneAssignmentBlocks.assignmentId, assignmentId));
  const known = new Set(existing.map((b) => b.id));
  if (texts.some((t) => t.id !== undefined && !known.has(t.id))) throw new UnknownBlock();
  const now = new Date();
  await tx.delete(sceneAssignmentBlocks).where(eq(sceneAssignmentBlocks.assignmentId, assignmentId));
  await tx.insert(sceneAssignmentBlocks).values(
    texts.map((t, position) => ({ ...(t.id !== undefined ? { id: t.id } : {}), assignmentId, position, text: t.text, updatedAt: now })),
  );
  await tx
    .update(sceneAssignments)
    .set({ description: joinBlocks(texts.map((t) => t.text)), updatedAt: now, revision: sql`${sceneAssignments.revision} + 1` })
    .where(eq(sceneAssignments.id, assignmentId));
}

/** Largest accepted body of the blocks PUT (4 MiB). */
const BLOCKS_BODY_LIMIT = 4 * 1024 * 1024;

/** Registers `PUT /api/books/:bookId/scene-assignments/:assignmentId/blocks`. */
export async function sceneBlockRoutes(app: FastifyInstance): Promise<void> {
  // 200 blocks of 10 000 characters exceed Fastify's 1 MiB default, the more so in UTF-8 (umlauts are 2 bytes).
  const guarded = { preHandler: [requireUser, bookGuard()], bodyLimit: BLOCKS_BODY_LIMIT };

  app.put('/api/books/:bookId/scene-assignments/:assignmentId/blocks', guarded, async (request, reply) => {
    const { bookId, assignmentId } = request.params as { bookId: string; assignmentId: string };
    const parsed = SceneBlocksBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    await assertAssignmentInBook(app.db, assignmentId, bookId);
    const { revision, blocks } = parsed.data;
    try {
      // The revision check and the write happen under the book row lock, so two saves cannot both pass it.
      return await app.mutate(bookId, async (tx) => {
        await assertRevision(tx, assignmentId, revision);
        await writeBlocks(tx, assignmentId, blocks);
      });
    } catch (error) {
      if (error instanceof StaleRevision) return reply.code(409).send({ error: 'stale' });
      if (error instanceof UnknownBlock) return reply.code(400).send({ error: 'unknown_block' });
      throw error;
    }
  });
}
