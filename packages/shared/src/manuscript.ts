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

export const MANUSCRIPT_LIMITS = { title: 200, synopsis: 4000, text: 200000, comment: 2000, instruction: 2000 } as const;

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
  /** Concrete instructions for this block, used by the AI draft (FR-018). */
  instruction: string;
  lock: BlockLock | null;
  updatedAt: string;
  /** Comments, oldest first. */
  comments: BlockComment[];
  /** Open reviewer suggestions, oldest first (FR-023). */
  suggestions: BlockSuggestion[];
}

/** A comment on a block. */
export interface BlockComment {
  id: Id;
  authorName: string;
  /** True when the caller wrote it (may delete it; the author may delete any). */
  mine: boolean;
  text: string;
  createdAt: string;
}

/** A reviewer's proposed new content for a block; the author accepts or rejects it (FR-023). */
export interface BlockSuggestion {
  id: Id;
  authorName: string;
  mine: boolean;
  /** Block version the suggestion was made on; older than the current one means the block changed since. */
  baseVersion: number;
  title: string;
  synopsis: string;
  text: string;
  note: string;
  createdAt: string;
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
  reason: 'create' | 'edit' | 'restore' | 'suggestion';
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
  /** `initial`: first structure; `adjust`: changes to the whole structure; `chapter`: changes inside one chapter (FR-014). */
  kind: 'initial' | 'adjust' | 'chapter';
  /** The chapter a `chapter` proposal is about. */
  chapterId: Id | null;
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
  /** Style of this work. */
  style: BookStyle;
  /** Team styles: for the author all of theirs (to pick from), for reviewers the ones this work uses. */
  teamStyles: TeamStyle[];
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

export const CommentBody = z.object({ text: z.string().trim().min(1).max(MANUSCRIPT_LIMITS.comment) });
export type CommentBody = z.infer<typeof CommentBody>;

export const InstructionBody = z.object({ instruction: z.string().trim().max(MANUSCRIPT_LIMITS.instruction) });
export type InstructionBody = z.infer<typeof InstructionBody>;

export const SuggestionBody = z.object({
  baseVersion: z.number().int().min(1),
  title,
  synopsis: z.string().max(MANUSCRIPT_LIMITS.synopsis),
  text: z.string().max(MANUSCRIPT_LIMITS.text),
  note: z.string().trim().max(MANUSCRIPT_LIMITS.comment).optional(),
});
export type SuggestionBody = z.infer<typeof SuggestionBody>;

export const ReviewerCreateBody = z.object({ email: z.string().trim().toLowerCase().email(), rights: Rights });
export type ReviewerCreateBody = z.infer<typeof ReviewerCreateBody>;

export const ReviewerPatchBody = z.object({ rights: Rights });
export type ReviewerPatchBody = z.infer<typeof ReviewerPatchBody>;

export const ProposalRequestBody = z.object({
  /** Optional wish of the author, e.g. "kürzere Kapitel". */
  wish: z.string().trim().max(1000).optional(),
  /** Limit the proposal to one chapter (FR-014). */
  chapterId: Id.optional(),
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

/** A predefined writing style the author can pick for a work (FR-015). */
export interface StylePreset { key: string; name: string; description: string }

/** Predefined styles; the description is what the AI is told. */
export const STYLE_PRESETS: readonly StylePreset[] = [
  { key: 'klassisch', name: 'Klassisch erzählend', description: 'Ruhiger, vollständiger Satzbau, auktoriale Distanz, sorgfältige Beschreibungen.' },
  { key: 'knapp', name: 'Modern und knapp', description: 'Kurze Sätze, wenig Adjektive, viel Subtext, zügiges Tempo.' },
  { key: 'poetisch', name: 'Poetisch', description: 'Bildreiche Sprache, Rhythmus und Klang, Stimmungen und Sinneseindrücke im Vordergrund.' },
  { key: 'spannung', name: 'Spannungsgeladen', description: 'Hohes Tempo, Cliffhanger am Ende von Szenen, gezielt gesetzte Informationen.' },
  { key: 'humorvoll', name: 'Humorvoll', description: 'Leichter Ton, Situationskomik, pointierte Dialoge.' },
  { key: 'jugendbuch', name: 'Jugendbuch', description: 'Nahe an der Hauptfigur, klare Sprache, lebendige Dialoge, emotionale Unmittelbarkeit.' },
  { key: 'ich-perspektive', name: 'Ich-Perspektive', description: 'Erzählt in der ersten Person aus Sicht der Hauptfigur.' },
];

/** A base style of the author's team, reusable in all of the author's works (FR-017). */
export interface TeamStyle { id: Id; name: string; description: string }

/** The style of one work: picked presets and team styles plus the author's own addition (FR-016: per work only). */
export interface BookStyle { presetKeys: string[]; teamStyleIds: Id[]; addition: string }

export const STYLE_LIMITS = { name: 100, description: 2000, addition: 4000 } as const;

export const BookStyleBody = z.object({
  presetKeys: z.array(z.string()).max(STYLE_PRESETS.length).transform((keys) => STYLE_PRESETS.map((p) => p.key).filter((k) => keys.includes(k))),
  teamStyleIds: z.array(Id).max(50),
  addition: z.string().trim().max(STYLE_LIMITS.addition),
});
export type BookStyleBody = z.infer<typeof BookStyleBody>;

export const TeamStyleBody = z.object({
  name: z.string().trim().min(1).max(STYLE_LIMITS.name),
  description: z.string().trim().min(1).max(STYLE_LIMITS.description),
});
export type TeamStyleBody = z.infer<typeof TeamStyleBody>;
