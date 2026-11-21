/** Test fixtures for scene tests: a book with one section, scenes and assignments. */
import type { Book, Scene, SceneAssignment } from '@bookly/shared';
import { sampleBook } from '../book/testFixtures';

/** The sample book with two sections in its main storyline. */
export function bookWithSections(): Book {
  const book = sampleBook();
  book.storylines[0]!.sections = [
    { id: 'sec1', storylineId: 's1', title: 'Ankunft', description: '', characterIds: [], range: { startId: 't1', endId: 't1' }, note: null, order: 0 },
    { id: 'sec2', storylineId: 's1', title: 'Abschied', description: '', characterIds: [], range: { startId: 't2', endId: 't2' }, note: null, order: 1 },
  ];
  return book;
}

/** `bookWithSections` plus the side strand „Erinnerung“ (s2), which has no sections. */
export function bookWithSideStrand(): Book {
  const book = bookWithSections();
  book.storylines.push({
    id: 's2', title: 'Erinnerung', description: '', characterIds: [], range: { startId: 't1', endId: 't2' },
    kind: 'side', status: 'in_progress', color: '#E3B54A', note: null, additions: [], sections: [],
  });
  return book;
}

/** A scene; override fields as needed. */
export function scene(over: Partial<Scene> = {}): Scene {
  return { id: 'sc1', name: 'Bergsee', image: null, notes: [], ...over };
}

/** An assignment; override fields as needed. */
export function assignment(over: Partial<SceneAssignment> = {}): SceneAssignment {
  return { id: 'a1', sceneId: 'sc1', sectionId: 'sec1', storylineId: null, description: '', updatedAt: '2026-11-01T00:00:00.000Z', ...over };
}
