/** Scene types, request bodies and pure rules shared by server and web (spec 2026-11-21-szenen-design.md). */
import { z } from 'zod';
import type { Id } from './domain.js';

/** Image types a scene accepts. */
export const SCENE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type SceneImageType = (typeof SCENE_IMAGE_TYPES)[number];
/** Largest accepted scene image (5 MB, decision on Q-001). */
export const SCENE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Field limits of scenes. */
export const SCENE_LIMITS = { name: 200, note: 10000, description: 2000 } as const;
/** Limits of the text blocks of a scene assignment. */
export const SCENE_BLOCK_LIMITS = { text: 10000, count: 200 } as const;
/** Blocks are joined with this separator into one text. */
export const BLOCK_SEPARATOR = '\n\n';
/** Most note characters handed to the AI per request; later notes are left out. */
export const SCENE_AI_NOTE_BUDGET = 20000;

/** Stored image of a scene; `version` changes whenever the image is replaced (cache-busting). */
export interface SceneImageInfo { mime: SceneImageType; size: number; version: string }
/** One text note of a scene. */
export interface SceneNote { id: Id; text: string }
/** A place or setting with an optional image and any number of notes. */
export interface Scene { id: Id; name: string; image: SceneImageInfo | null; notes: SceneNote[] }
/** One text block (paragraph-sized passage) of a scene assignment. */
export interface SceneBlock { id: Id; text: string }
/**
 * A scene assigned to a section of a main strand or to a whole storyline (e.g. a side strand, which has
 * no sections); exactly one of `sectionId` and `storylineId` is set. Carries the scene description there.
 */
export interface SceneAssignment { id: Id; sceneId: Id; sectionId: Id | null; storylineId: Id | null; description: string; blocks: SceneBlock[]; revision: number; updatedAt: string }
/** Where an assignment points: a section or a whole storyline. */
export type SceneTarget = { sectionId: Id } | { storylineId: Id };
/** Result of the AI scene description request. */
export interface SceneDescriptionResult { description: string }

const Id = z.string().uuid();
const name = z.string().trim().min(1).max(SCENE_LIMITS.name);
/**
 * A whole description, as written by „Zuordnen“ or „Übernehmen“: it is split into blocks on the server
 * (descriptionToBlocks), so it may be as long as the blocks can hold; each block is checked there.
 */
const description = z.string().trim().max(SCENE_BLOCK_LIMITS.count * (SCENE_BLOCK_LIMITS.text + BLOCK_SEPARATOR.length));

export const SceneBody = z.object({ name });
export type SceneBody = z.infer<typeof SceneBody>;

export const SceneNoteBody = z.object({ text: z.string().trim().max(SCENE_LIMITS.note) });
export type SceneNoteBody = z.infer<typeof SceneNoteBody>;

/** Exactly one target: a section or a storyline. */
const oneTarget = (b: { sectionId?: string; storylineId?: string }) => (b.sectionId === undefined) !== (b.storylineId === undefined);

export const SceneAssignmentCreateBody = z
  .object({ sceneId: Id, sectionId: Id.optional(), storylineId: Id.optional(), description: description.default('') })
  .refine(oneTarget, { message: 'exactly one of sectionId and storylineId' });
export type SceneAssignmentCreateBody = z.infer<typeof SceneAssignmentCreateBody>;

/** Change an assignment's description, move it to another section or storyline, or both. */
export const SceneAssignmentPatchBody = z
  .object({ description: description.optional(), sectionId: Id.optional(), storylineId: Id.optional(), revision: z.number().int().min(0).optional() })
  .refine((b) => !(b.sectionId && b.storylineId), { message: 'at most one target' })
  .refine((b) => b.description !== undefined || b.sectionId !== undefined || b.storylineId !== undefined, { message: 'nothing to change' });
export type SceneAssignmentPatchBody = z.infer<typeof SceneAssignmentPatchBody>;

/** Replace all blocks of an assignment; `revision` is the one the editor started from (stale saves are 409). Text is kept as typed. */
export const SceneBlocksBody = z
  .object({
    revision: z.number().int().min(0),
    blocks: z
      .array(z.object({ id: Id.optional(), text: z.string().max(SCENE_BLOCK_LIMITS.text) }))
      .min(1)
      .max(SCENE_BLOCK_LIMITS.count),
  })
  .refine(
    (b) => {
      const ids = b.blocks.flatMap((x) => (x.id ? [x.id] : []));
      return new Set(ids).size === ids.length;
    },
    { message: 'duplicate block ids' },
  );
export type SceneBlocksBody = z.infer<typeof SceneBlocksBody>;

/** Joins block texts into one text. */
export function joinBlocks(texts: string[]): string {
  return texts.join(BLOCK_SEPARATOR);
}

/**
 * Splits a whole description into block texts on BLOCK_SEPARATOR, so `joinBlocks(descriptionToBlocks(t)) === t`
 * for every text. Beyond SCENE_BLOCK_LIMITS.count parts, the rest is merged (joined with the separator) into
 * the last block, so no character is lost; that block may then exceed the block text limit (the caller checks).
 */
export function descriptionToBlocks(text: string): string[] {
  const parts = text.split(BLOCK_SEPARATOR);
  if (parts.length <= SCENE_BLOCK_LIMITS.count) return parts;
  const head = parts.slice(0, SCENE_BLOCK_LIMITS.count - 1);
  return [...head, joinBlocks(parts.slice(SCENE_BLOCK_LIMITS.count - 1))];
}

/** True when `i` falls between the two halves of a UTF-16 surrogate pair (e.g. inside an emoji). */
const insidePair = (text: string, i: number) => {
  const before = text.charCodeAt(i - 1);
  const after = text.charCodeAt(i);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
};

/**
 * Splits a block text at the caret into two halves that concatenate to the original; null unless the caret
 * is an integer strictly inside the text and not inside a surrogate pair (which would break a character).
 */
export function splitBlockText(text: string, caret: number): [string, string] | null {
  if (!Number.isInteger(caret) || !(caret > 0 && caret < text.length) || insidePair(text, caret)) return null;
  return [text.slice(0, caret), text.slice(caret)];
}

/**
 * Optional section or storyline the description is meant for (added as context). `sample` asks for a short
 * prose sample of the setting instead, to get a feel for how it reads in the book; it is never stored.
 */
export const SceneDescriptionBody = z.object({
  sectionId: Id.nullable().default(null),
  storylineId: Id.nullable().default(null),
  kind: z.enum(['assignment', 'sample']).default('assignment'),
});
export type SceneDescriptionBody = z.infer<typeof SceneDescriptionBody>;

/** Key of an assignment's target, e.g. for select values: `section:<id>` or `storyline:<id>`. */
export function targetKey(t: { sectionId?: Id | null; storylineId?: Id | null }): string {
  return t.sectionId ? `section:${t.sectionId}` : `storyline:${t.storylineId}`;
}

/** Inverse of `targetKey`. */
export function parseTargetKey(key: string): SceneTarget {
  const [kind, id] = key.split(':') as [string, Id];
  return kind === 'section' ? { sectionId: id } : { storylineId: id };
}

/** True when the scene has something the AI can describe from: an image or a non-blank note (EC-003). */
export function hasSceneContext(scene: Pick<Scene, 'image' | 'notes'>): boolean {
  return scene.image !== null || scene.notes.some((n) => n.text.trim() !== '');
}

/**
 * Earlier descriptions of a scene across all its assignments: non-blank, distinct, newest first
 * (FR-005). The first entry is what a new assignment starts with.
 */
export function previousDescriptions(sceneId: Id, assignments: SceneAssignment[]): string[] {
  const own = assignments
    .filter((a) => a.sceneId === sceneId && a.description.trim() !== '')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...new Set(own.map((a) => a.description))];
}
