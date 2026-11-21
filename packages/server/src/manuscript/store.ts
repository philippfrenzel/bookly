/** Row lookups, ordering and versioning helpers shared by the manuscript routes. */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { UUID_RE, lockActive } from '@bookly/shared';
import type { Id } from '@bookly/shared';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import { blockVersions, blocks, chapters } from '../db/schema.js';
import { HttpError } from './access.js';

export type BlockRow = typeof blocks.$inferSelect;
export type ChapterRow = typeof chapters.$inferSelect;

/** The chapter `id` of `bookId` (live or deleted), else 404. */
export async function chapterOf(tx: Db | Tx, bookId: Id, id: string): Promise<ChapterRow> {
  if (!UUID_RE.test(id)) throw new HttpError(404, 'not_found');
  const [row] = await tx.select().from(chapters).where(and(eq(chapters.id, id), eq(chapters.bookId, bookId)));
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

/** The block `id` of `bookId` (live or deleted), else 404. */
export async function blockOf(tx: Db | Tx, bookId: Id, id: string): Promise<BlockRow> {
  if (!UUID_RE.test(id)) throw new HttpError(404, 'not_found');
  const [row] = await tx.select().from(blocks).where(and(eq(blocks.id, id), eq(blocks.bookId, bookId)));
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

/** True when someone other than `userId` holds a lock on the block that has not run out (FR-007, FR-009). */
export function lockedByOther(row: BlockRow, userId: Id, now = new Date()): boolean {
  return row.lockedBy !== null && row.lockedBy !== userId && row.lockedAt !== null && lockActive(row.lockedAt, now);
}

/** Throws 423 `locked` when another user holds the block's lock; the UI shows the message (FR-011). */
export function assertNotLockedByOther(row: BlockRow, userId: Id): void {
  if (lockedByOther(row, userId)) throw new HttpError(423, 'locked');
}

/** Moves `id` to `index` within `ids` (clamped) and returns the new order. */
export function placeAt(ids: Id[], id: Id, index: number): Id[] {
  const rest = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Ids of the live chapters of a book in order. */
export async function liveChapterIds(tx: Tx, bookId: Id): Promise<Id[]> {
  const rows = await tx
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.bookId, bookId), isNull(chapters.deletedAt)))
    .orderBy(asc(chapters.position), asc(chapters.createdAt));
  return rows.map((r) => r.id);
}

/** Ids of the live blocks of a chapter in order. */
export async function liveBlockIds(tx: Tx, chapterId: Id): Promise<Id[]> {
  const rows = await tx
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.chapterId, chapterId), isNull(blocks.deletedAt)))
    .orderBy(asc(blocks.position), asc(blocks.createdAt));
  return rows.map((r) => r.id);
}

/** Writes positions 0..n-1 for the chapters in `ids`. */
export async function writeChapterOrder(tx: Tx, ids: Id[]): Promise<void> {
  for (const [position, id] of ids.entries()) await tx.update(chapters).set({ position }).where(eq(chapters.id, id));
}

/** Writes positions 0..n-1 (and the chapter) for the blocks in `ids`. */
export async function writeBlockOrder(tx: Tx, chapterId: Id, ids: Id[]): Promise<void> {
  for (const [position, id] of ids.entries()) await tx.update(blocks).set({ position, chapterId }).where(eq(blocks.id, id));
}

/** Content of one block version. */
export interface BlockContent {
  title: string;
  synopsis: string;
  text: string;
}

/** Inserts a new block with version 1 at the end of the chapter (or at `position`) and returns its id. */
export async function insertBlock(
  tx: Tx,
  input: BlockContent & { bookId: Id; chapterId: Id; sectionId?: Id | null; storylineId?: Id | null; sceneIds?: Id[]; position?: number },
  authorId: Id,
): Promise<Id> {
  const order = await liveBlockIds(tx, input.chapterId);
  const [row] = await tx
    .insert(blocks)
    .values({
      bookId: input.bookId,
      chapterId: input.chapterId,
      position: order.length,
      title: input.title,
      synopsis: input.synopsis,
      text: input.text,
      sectionId: input.sectionId ?? null,
      storylineId: input.storylineId ?? null,
      sceneIds: input.sceneIds ?? [],
    })
    .returning({ id: blocks.id });
  await tx.insert(blockVersions).values({ blockId: row!.id, version: 1, ...pick(input), reason: 'create', authorId });
  if (input.position !== undefined) await writeBlockOrder(tx, input.chapterId, placeAt([...order, row!.id], row!.id, input.position));
  return row!.id;
}

/** Stores new content as the next version of the block; every version stays (FR-004). */
export async function writeVersion(tx: Tx, row: BlockRow, content: BlockContent, reason: 'edit' | 'restore', authorId: Id): Promise<void> {
  const version = row.version + 1;
  await tx.insert(blockVersions).values({ blockId: row.id, version, ...pick(content), reason, authorId });
  await tx.update(blocks).set({ ...pick(content), version, updatedAt: new Date() }).where(eq(blocks.id, row.id));
}

/** Keeps only the content fields. */
function pick(c: BlockContent): BlockContent {
  return { title: c.title, synopsis: c.synopsis, text: c.text };
}

/** Live block ids among `ids` that belong to `bookId`. */
export async function liveBlocksIn(tx: Tx, bookId: Id, ids: Id[]): Promise<Set<Id>> {
  if (ids.length === 0) return new Set();
  const rows = await tx
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.bookId, bookId), inArray(blocks.id, ids), isNull(blocks.deletedAt)));
  return new Set(rows.map((r) => r.id));
}
