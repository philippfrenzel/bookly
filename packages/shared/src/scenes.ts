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
/** Most note characters handed to the AI per request; later notes are left out. */
export const SCENE_AI_NOTE_BUDGET = 20000;

/** Stored image of a scene; `version` changes whenever the image is replaced (cache-busting). */
export interface SceneImageInfo { mime: SceneImageType; size: number; version: string }
/** One text note of a scene. */
export interface SceneNote { id: Id; text: string }
/** A place or setting with an optional image and any number of notes. */
export interface Scene { id: Id; name: string; image: SceneImageInfo | null; notes: SceneNote[] }
/** A scene assigned to a section, carrying that section's scene description. */
export interface SceneAssignment { id: Id; sceneId: Id; sectionId: Id; description: string; updatedAt: string }
/** Result of the AI scene description request. */
export interface SceneDescriptionResult { description: string }

const Id = z.string().uuid();
const name = z.string().trim().min(1).max(SCENE_LIMITS.name);
const description = z.string().trim().max(SCENE_LIMITS.description);

export const SceneBody = z.object({ name });
export type SceneBody = z.infer<typeof SceneBody>;

export const SceneNoteBody = z.object({ text: z.string().trim().max(SCENE_LIMITS.note) });
export type SceneNoteBody = z.infer<typeof SceneNoteBody>;

export const SceneAssignmentCreateBody = z.object({ sceneId: Id, sectionId: Id, description: description.default('') });
export type SceneAssignmentCreateBody = z.infer<typeof SceneAssignmentCreateBody>;

export const SceneAssignmentPatchBody = z.object({ description });
export type SceneAssignmentPatchBody = z.infer<typeof SceneAssignmentPatchBody>;

/** Optional section the description is meant for; adds the section as context. */
export const SceneDescriptionBody = z.object({ sectionId: Id.nullable().default(null) });
export type SceneDescriptionBody = z.infer<typeof SceneDescriptionBody>;

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
