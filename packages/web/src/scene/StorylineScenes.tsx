/**
 * „Szenen“ tab of a storyline: scenes assigned to the whole storyline (the only way for a side strand,
 * which has no sections) and, for a main strand, an overview of the scenes in its sections.
 */
import type { Book, Id, SceneAssignment, Storyline } from '@bookly/shared';
import { useBook } from '../api/hooks';
import { SceneAssignments } from './SceneAssignments';

/** Number of assignments to the storyline itself and to its sections. */
export function storylineSceneCount(storyline: Storyline, assignments: SceneAssignment[]): number {
  const sections = new Set(storyline.sections.map((s) => s.id));
  return assignments.filter((a) => a.storylineId === storyline.id || (a.sectionId !== null && sections.has(a.sectionId))).length;
}

interface Props {
  book: Book;
  storyline: Storyline;
  aiEnabled: boolean;
  /** Switches to the „Zeitpunkte“ tab, where scenes are assigned to single sections. */
  onShowTimeline?: () => void;
}

/** The tab content; scene data comes from the cached book response. */
export function StorylineScenes({ book, storyline, aiEnabled, onShowTimeline }: Props) {
  const data = useBook(book.id).data;
  const sceneName = new Map((data?.scenes ?? []).map((s) => [s.id, s.name]));
  const bySection = (sectionId: Id) =>
    (data?.sceneAssignments ?? []).filter((a) => a.sectionId === sectionId).map((a) => sceneName.get(a.sceneId)).filter((n): n is string => !!n);
  const sections = [...storyline.sections].sort((a, b) => a.order - b.order);
  const main = storyline.kind === 'main';

  return (
    <div className="storyline-scenes">
      <SceneAssignments
        bookId={book.id}
        target={{ storylineId: storyline.id }}
        aiEnabled={aiEnabled}
        legend={main ? 'Szenen der ganzen Storyline' : 'Szenen'}
      />
      {main && (
        <div className="storyline-section-scenes">
          <span className="scene-label">In den Abschnitten</span>
          {sections.length === 0 ? (
            <p className="muted">Noch keine Abschnitte.</p>
          ) : (
            <ul>
              {sections.map((s) => {
                const names = bySection(s.id);
                return (
                  <li key={s.id}>
                    <span className="section-name">{s.title}</span>
                    {names.length > 0 ? names.map((n) => <span key={n} className="scene-chip">{n}</span>) : <span className="muted">keine Szene</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted">
            Einem einzelnen Abschnitt ordnest du eine Szene unter{' '}
            {onShowTimeline ? <button type="button" className="link-button" onClick={onShowTimeline}>„Zeitpunkte“</button> : '„Zeitpunkte“'}{' '}
            zu, wenn du den Abschnitt bearbeitest.
          </p>
        </div>
      )}
    </div>
  );
}
