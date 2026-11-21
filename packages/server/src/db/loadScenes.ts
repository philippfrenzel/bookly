/** Loads the scenes of a book and their assignments (to sections or storylines) for the BookResponse (image bytes excluded). */
import { asc, eq, inArray } from 'drizzle-orm';
import type { Id, Scene, SceneAssignment, SceneImageType } from '@bookly/shared';
import type { Db } from './client.js';
import type { Tx } from './loadBook.js';
import { sceneAssignments, sceneImages, sceneNotes, scenes } from './schema.js';

/** Scenes sorted by name (notes by position) and all assignments of the book's scenes. */
export async function loadScenes(db: Db | Tx, bookId: Id): Promise<{ scenes: Scene[]; sceneAssignments: SceneAssignment[] }> {
  const rows = await db.select().from(scenes).where(eq(scenes.bookId, bookId)).orderBy(asc(scenes.name), asc(scenes.id));
  if (rows.length === 0) return { scenes: [], sceneAssignments: [] };
  const ids = rows.map((r) => r.id);
  const [images, notes, assignments] = await Promise.all([
    db
      .select({ sceneId: sceneImages.sceneId, mime: sceneImages.mime, size: sceneImages.size, updatedAt: sceneImages.updatedAt })
      .from(sceneImages)
      .where(inArray(sceneImages.sceneId, ids)),
    db.select().from(sceneNotes).where(inArray(sceneNotes.sceneId, ids)).orderBy(asc(sceneNotes.position), asc(sceneNotes.createdAt)),
    db.select().from(sceneAssignments).where(inArray(sceneAssignments.sceneId, ids)).orderBy(asc(sceneAssignments.updatedAt), asc(sceneAssignments.id)),
  ]);
  const imageBy = new Map(images.map((i) => [i.sceneId, i]));
  return {
    scenes: rows.map((r) => {
      const img = imageBy.get(r.id);
      return {
        id: r.id,
        name: r.name,
        image: img ? { mime: img.mime as SceneImageType, size: img.size, version: img.updatedAt.toISOString() } : null,
        notes: notes.filter((n) => n.sceneId === r.id).map((n) => ({ id: n.id, text: n.text })),
      };
    }),
    sceneAssignments: assignments.map((a) => ({
      id: a.id,
      sceneId: a.sceneId,
      sectionId: a.sectionId,
      storylineId: a.storylineId,
      description: a.description,
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}
