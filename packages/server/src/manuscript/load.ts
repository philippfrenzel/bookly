/** Loads the manuscript of a book (chapters, blocks, trash, proposals, reviewers, light context) for one caller. */
import { and, asc, desc, eq } from 'drizzle-orm';
import { lockActive, LOCK_TIMEOUT_MINUTES, normalizeRights } from '@bookly/shared';
import type {
  BlockComment,
  BlockSuggestion,
  Id,
  ManuscriptBlock,
  ManuscriptChapter,
  ManuscriptResponse,
  ProposalChapter,
  ReviewerRight,
  TrashItem,
} from '@bookly/shared';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/loadBook.js';
import {
  blockComments,
  blockSuggestions,
  blocks,
  bookStyles,
  teamStyles,
  bookReviewers,
  books,
  chapters,
  scenes,
  sections,
  storylines,
  structureProposals,
  users,
} from '../db/schema.js';

type BlockRow = typeof blocks.$inferSelect;

/** Maps a block row to the API shape; the lock only says whether it is the caller's (FR-013). */
export function toBlock(
  row: BlockRow,
  userId: Id,
  now = new Date(),
  extras: { comments: BlockComment[]; suggestions: BlockSuggestion[] } = { comments: [], suggestions: [] },
): ManuscriptBlock {
  const locked = row.lockedBy !== null && row.lockedAt !== null && lockActive(row.lockedAt, now);
  return {
    id: row.id,
    chapterId: row.chapterId,
    position: row.position,
    title: row.title,
    synopsis: row.synopsis,
    text: row.text,
    version: row.version,
    sectionId: row.sectionId,
    storylineId: row.storylineId,
    sceneIds: row.sceneIds,
    instruction: row.instruction,
    lock: locked
      ? { mine: row.lockedBy === userId, expiresAt: new Date(row.lockedAt!.getTime() + LOCK_TIMEOUT_MINUTES * 60_000).toISOString() }
      : null,
    updatedAt: row.updatedAt.toISOString(),
    comments: extras.comments,
    suggestions: extras.suggestions,
  };
}

/** Builds the full manuscript response for `userId` with the given access. */
export async function loadManuscript(
  db: Db | Tx,
  bookId: Id,
  userId: Id,
  access: { role: 'author' | 'reviewer'; rights: ReviewerRight[] },
  aiEnabled: boolean,
): Promise<ManuscriptResponse> {
  const isAuthor = access.role === 'author';
  const [[book], chapterRows, blockRows, lines, sectionRows, sceneRows, proposalRows, reviewerRows] = await Promise.all([
    db.select({ id: books.id, title: books.title }).from(books).where(eq(books.id, bookId)),
    db.select().from(chapters).where(eq(chapters.bookId, bookId)).orderBy(asc(chapters.position), asc(chapters.createdAt)),
    db.select().from(blocks).where(eq(blocks.bookId, bookId)).orderBy(asc(blocks.position), asc(blocks.createdAt)),
    db.select({ id: storylines.id, title: storylines.title, color: storylines.color }).from(storylines).where(eq(storylines.bookId, bookId)).orderBy(asc(storylines.title)),
    db
      .select({ id: sections.id, title: sections.title, storylineId: sections.storylineId })
      .from(sections)
      .innerJoin(storylines, eq(storylines.id, sections.storylineId))
      .where(eq(storylines.bookId, bookId))
      .orderBy(asc(sections.order)),
    db.select({ id: scenes.id, name: scenes.name }).from(scenes).where(eq(scenes.bookId, bookId)).orderBy(asc(scenes.name)),
    isAuthor
      ? db
          .select()
          .from(structureProposals)
          .where(and(eq(structureProposals.bookId, bookId), eq(structureProposals.status, 'open')))
          .orderBy(desc(structureProposals.createdAt))
      : Promise.resolve([]),
    isAuthor
      ? db
          .select({ userId: users.id, email: users.email, displayName: users.displayName, rights: bookReviewers.rights })
          .from(bookReviewers)
          .innerJoin(users, eq(users.id, bookReviewers.userId))
          .where(eq(bookReviewers.bookId, bookId))
          .orderBy(asc(bookReviewers.createdAt))
      : Promise.resolve([]),
  ]);
  const [commentRows, suggestionRows] = await Promise.all([
    db
      .select({ id: blockComments.id, blockId: blockComments.blockId, authorId: blockComments.authorId, authorName: users.displayName, text: blockComments.text, createdAt: blockComments.createdAt })
      .from(blockComments)
      .innerJoin(blocks, eq(blocks.id, blockComments.blockId))
      .leftJoin(users, eq(users.id, blockComments.authorId))
      .where(eq(blocks.bookId, bookId))
      .orderBy(asc(blockComments.createdAt)),
    db
      .select({ s: blockSuggestions, authorName: users.displayName })
      .from(blockSuggestions)
      .innerJoin(blocks, eq(blocks.id, blockSuggestions.blockId))
      .leftJoin(users, eq(users.id, blockSuggestions.authorId))
      .where(and(eq(blocks.bookId, bookId), eq(blockSuggestions.status, 'open')))
      .orderBy(asc(blockSuggestions.createdAt)),
  ]);
  const extrasOf = (blockId: Id) => ({
    comments: commentRows.filter((c) => c.blockId === blockId).map((c): BlockComment => ({
      id: c.id, authorName: c.authorName ?? 'Unbekannt', mine: c.authorId === userId, text: c.text, createdAt: c.createdAt.toISOString(),
    })),
    suggestions: suggestionRows.filter((r) => r.s.blockId === blockId).map(({ s: x, authorName }): BlockSuggestion => ({
      id: x.id, authorName: authorName ?? 'Unbekannt', mine: x.authorId === userId, baseVersion: x.baseVersion,
      title: x.title, synopsis: x.synopsis, text: x.text, note: x.note, createdAt: x.createdAt.toISOString(),
    })),
  });
  const [[styleRow], [owner]] = await Promise.all([
    db.select().from(bookStyles).where(eq(bookStyles.bookId, bookId)),
    db.select({ userId: books.userId }).from(books).where(eq(books.id, bookId)),
  ]);
  const style = { presetKeys: styleRow?.presetKeys ?? [], teamStyleIds: styleRow?.teamStyleIds ?? [], addition: styleRow?.addition ?? '' };
  const ownerStyles = owner
    ? await db.select({ id: teamStyles.id, name: teamStyles.name, description: teamStyles.description }).from(teamStyles).where(eq(teamStyles.ownerId, owner.userId)).orderBy(asc(teamStyles.name))
    : [];
  const now = new Date();
  const live = chapterRows.filter((c) => c.deletedAt === null);
  const chapterList: ManuscriptChapter[] = live.map((c) => ({
    id: c.id,
    position: c.position,
    title: c.title,
    blocks: blockRows.filter((b) => b.chapterId === c.id && b.deletedAt === null).map((b) => toBlock(b, userId, now, extrasOf(b.id))),
  }));
  const chapterTitle = new Map(chapterRows.map((c) => [c.id, c.title]));
  const trash: TrashItem[] = [
    ...chapterRows
      .filter((c) => c.deletedAt !== null)
      .map((c): TrashItem => ({ kind: 'chapter', id: c.id, title: c.title, chapterTitle: null, deletedAt: c.deletedAt!.toISOString(), comment: c.deleteComment })),
    ...blockRows
      .filter((b) => b.deletedAt !== null)
      .map((b): TrashItem => ({
        kind: 'block',
        id: b.id,
        title: b.title,
        chapterTitle: chapterTitle.get(b.chapterId) ?? null,
        deletedAt: b.deletedAt!.toISOString(),
        comment: b.deleteComment,
      })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return {
    book: book!,
    role: access.role,
    rights: access.rights,
    chapters: chapterList,
    trash,
    proposals: proposalRows.map((p) => ({
      id: p.id,
      kind: p.kind as 'initial' | 'adjust' | 'chapter',
      chapterId: p.chapterId,
      summary: p.summary,
      chapters: p.payload as ProposalChapter[],
      createdAt: p.createdAt.toISOString(),
    })),
    reviewers: reviewerRows.map((r) => ({ ...r, rights: normalizeRights(r.rights) })),
    context: { storylines: lines, sections: sectionRows, scenes: sceneRows },
    style: { ...style, teamStyleIds: style.teamStyleIds.filter((id) => ownerStyles.some((t) => t.id === id)) },
    teamStyles: isAuthor ? ownerStyles : ownerStyles.filter((t) => style.teamStyleIds.includes(t.id)),
    ai: { enabled: aiEnabled },
  };
}
