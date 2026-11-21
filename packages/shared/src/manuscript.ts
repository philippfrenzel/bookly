/**
 * Manuscript (chapter structure) domain: chapters, Bausteine (blocks), versions, reviewer rights, locks and
 * AI structure proposals. See docs/superpowers/specs/2026-11-21-kapitelstruktur-design.md.
 *
 * A Baustein is the smallest editable text unit of the manuscript: one scene-level passage inside a chapter.
 * It may point at the section or storyline and the scenes it tells, and carries a short plan (synopsis) and the prose.
 */
import { z } from 'zod';
import type { Id } from './domain.js';

/** Rights a reviewer (Lektor) can be granted per book (BR-001). `read` is always granted. */
export const REVIEWER_RIGHTS = ['read', 'comment', 'suggest', 'edit', 'delete', 'structure'] as const;
export type ReviewerRight = (typeof REVIEWER_RIGHTS)[number];

/** German labels of the reviewer rights. */
export const REVIEWER_RIGHT_LABELS: Record<ReviewerRight, string> = {
  read: 'Lesen',
  comment: 'Kommentieren',
  suggest: 'Vorschläge erstellen',
  edit: 'Direkt bearbeiten',
  delete: 'Löschen',
  structure: 'Struktur ändern',
};

/** At most this many reviewers per book (FR-006). */
export const MAX_REVIEWERS = 5;
/** A lock is released automatically this long after it was taken, regardless of activity (FR-009, EC-001). */
export const LOCK_TIMEOUT_MINUTES = 30;

export const MANUSCRIPT_LIMITS = { title: 200, synopsis: 4000, text: 200000, comment: 2000 } as const;

/** Lock state of a block as shown to users: only whether it is locked, never by whom (FR-013). */
export interface BlockLock {
  /** True when the caller holds the lock. */
  mine: boolean;
  /** ISO time the lock runs out. */
  expiresAt: string;
}

/** A Baustein of the manuscript. */
export interface ManuscriptBlock {
  id: Id;
  chapterId: Id;
  position: number;
  title: string;
  /** What happens in this passage (the plan the AI or the author wrote). */
  synopsis: string;
  /** The prose. */
  text: string;
  /** Number of the current version; every saved change adds one (FR-004). */
  version: number;
  sectionId: Id | null;
  storylineId: Id | null;
  sceneIds: Id[];
  lock: BlockLock | null;
  updatedAt: string;
}

/** A chapter with its live blocks in order. */
export interface ManuscriptChapter {
  id: Id;
  position: number;
  title: string;
  blocks: ManuscriptBlock[];
}

/** A soft-deleted chapter or block in the trash (FR-025). */
export interface TrashItem {
  kind: 'chapter' | 'block';
  id: Id;
  title: string;
  /** Chapter title the block belonged to (blocks only). */
  chapterTitle: string | null;
  deletedAt: string;
  comment: string | null;
}

/** One stored version of a block. */
export interface BlockVersion {
  version: number;
  title: string;
  synopsis: string;
  text: string;
  authorName: string;
  createdAt: string;
  /** Why the version was written. */
  reason: 'create' | 'edit' | 'restore';
}

/** A reviewer of a book with their rights. */
export interface Reviewer {
  userId: Id;
  email: string;
  displayName: string;
  rights: ReviewerRight[];
}

/** One block in a structure proposal: an existing block (moved) or a new one. */
export interface ProposalBlock {
  blockId: Id | null;
  title: string;
  synopsis: string;
  sectionId: Id | null;
  storylineId: Id | null;
  sceneIds: Id[];
}

/** One chapter in a structure proposal: an existing chapter (kept, maybe renamed) or a new one. */
export interface ProposalChapter {
  chapterId: Id | null;
  title: string;
  /** Why the chapter looks like this (shown to the author). */
  reason: string;
  blocks: ProposalBlock[];
}

/** An AI structure proposal the author accepts or rejects (FR-001, FR-003, FR-020). */
export interface StructureProposal {
  id: Id;
  /** `initial`: first structure for an empty manuscript; `adjust`: changes to the existing structure. */
  kind: 'initial' | 'adjust';
  summary: string;
  chapters: ProposalChapter[];
  createdAt: string;
}

/** Light context from the book so the manuscript can name sources. */
export interface ManuscriptContext {
  storylines: { id: Id; title: string; color: string }[];
  sections: { id: Id; title: string; storylineId: Id }[];
  scenes: { id: Id; name: string }[];
}

/** Everything the manuscript page needs; every manuscript mutation answers with it. */
export interface ManuscriptResponse {
  book: { id: Id; title: string };
  role: 'author' | 'reviewer';
  /** The caller's rights; the author has all. */
  rights: ReviewerRight[];
  chapters: ManuscriptChapter[];
  trash: TrashItem[];
  /** Open proposals, newest first (author only; empty for reviewers). */
  proposals: StructureProposal[];
  /** Reviewers of the book (author only; empty for reviewers). */
  reviewers: Reviewer[];
  context: ManuscriptContext;
  ai: { enabled: boolean };
}

/** A book shared with the caller as reviewer. */
export interface ReviewedBook {
  id: Id;
  title: string;
  ownerName: string;
  rights: ReviewerRight[];
}

const Id = z.string().uuid();
const title = z.string().trim().min(1).max(MANUSCRIPT_LIMITS.title);
const comment = z.string().trim().max(MANUSCRIPT_LIMITS.comment);
const Rights = z.array(z.enum(REVIEWER_RIGHTS)).max(REVIEWER_RIGHTS.length);

export const ChapterCreateBody = z.object({ title, position: z.number().int().min(0).optional() });
export type ChapterCreateBody = z.infer<typeof ChapterCreateBody>;

export const ChapterPatchBody = z.object({ title });
export type ChapterPatchBody = z.infer<typeof ChapterPatchBody>;

export const MoveBody = z.object({ chapterId: Id.optional(), position: z.number().int().min(0) });
export type MoveBody = z.infer<typeof MoveBody>;

export const DeleteBody = z.object({ comment: comment.optional() }).optional();
export type DeleteBody = z.infer<typeof DeleteBody>;

export const BlockCreateBody = z.object({
  chapterId: Id,
  title,
  synopsis: z.string().max(MANUSCRIPT_LIMITS.synopsis).optional(),
  position: z.number().int().min(0).optional(),
});
export type BlockCreateBody = z.infer<typeof BlockCreateBody>;

/** A content change; `baseVersion` is the version the editor started from (stale edits are 409). */
export const BlockPatchBody = z
  .object({
    baseVersion: z.number().int().min(1),
    title: title.optional(),
    synopsis: z.string().max(MANUSCRIPT_LIMITS.synopsis).optional(),
    text: z.string().max(MANUSCRIPT_LIMITS.text).optional(),
  })
  .refine((b) => b.title !== undefined || b.synopsis !== undefined || b.text !== undefined, 'nothing to change');
export type BlockPatchBody = z.infer<typeof BlockPatchBody>;

export const ReviewerCreateBody = z.object({ email: z.string().trim().toLowerCase().email(), rights: Rights });
export type ReviewerCreateBody = z.infer<typeof ReviewerCreateBody>;

export const ReviewerPatchBody = z.object({ rights: Rights });
export type ReviewerPatchBody = z.infer<typeof ReviewerPatchBody>;

export const ProposalRequestBody = z.object({
  /** Optional wish of the author, e.g. "kürzere Kapitel". */
  wish: z.string().trim().max(1000).optional(),
});
export type ProposalRequestBody = z.infer<typeof ProposalRequestBody>;

/** Normalizes rights: known values only, no duplicates, `read` always included, in canonical order. */
export function normalizeRights(rights: readonly string[]): ReviewerRight[] {
  const set = new Set(rights);
  set.add('read');
  return REVIEWER_RIGHTS.filter((r) => set.has(r));
}

/** True when the lock taken at `lockedAt` is still in force at `now` (FR-009). */
export function lockActive(lockedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lockedAt.getTime() < LOCK_TIMEOUT_MINUTES * 60_000;
}
