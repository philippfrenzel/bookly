/**
 * Scene management tab: scenes with name, optional image and any number of notes (FR-001, FR-002).
 * Each scene lists where it is assigned (sections and whole storylines; a click opens it), can be
 * assigned from here, and can show an AI sample passage of the setting (preview only, not stored).
 */
import { useState } from 'react';
import type { Book, Id, Scene, SceneAssignment, SceneTarget } from '@bookly/shared';
import { hasSceneContext, previousDescriptions, SCENE_IMAGE_TYPES, SCENE_LIMITS, targetKey } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback, type SaveFeedback } from '../book/saveFeedback';
import { Icon } from '../ui/Icon';
import { sceneTargets, TargetSelect } from './SceneAssignments';
import { descriptionErrorMessage, imageProblem, sceneImageUrl, uploadErrorMessage, useSceneDescription, useUploadSceneImage } from './sceneApi';

/** A place a scene is assigned to (a section, or a whole storyline when `sectionId` is null), with what is needed to show and open it. */
interface AssignedSection {
  key: string;
  storylineId: Id;
  sectionId: Id | null;
  title: string;
  color: string;
}

interface ItemProps {
  book: Book;
  scene: Scene;
  sections: AssignedSection[];
  assignments: SceneAssignment[];
  aiEnabled: boolean;
  fb: SaveFeedback;
  onOpenSection?: (storylineId: Id, sectionId: Id) => void;
  onOpenStoryline?: (storylineId: Id) => void;
}

/** AI sample passage of the setting from image and notes, to get a feel for it; shown only, never stored. */
function SceneSample({ bookId, scene, aiEnabled }: { bookId: Id; scene: Scene; aiEnabled: boolean }) {
  const sample = useSceneDescription(bookId);
  const [text, setText] = useState<string | null>(null);
  const blocker = !aiEnabled ? 'KI nicht eingerichtet.' : !hasSceneContext(scene) ? 'Für ein Beispiel braucht die Szene ein Bild oder eine Notiz.' : null;
  const run = () => sample.mutate({ sceneId: scene.id, kind: 'sample' }, { onSuccess: (res) => setText(res.description) });
  return (
    <div className="scene-sample-block">
      {text === null ? (
        <button type="button" className="with-icon" disabled={blocker !== null || sample.isPending} title={blocker ?? undefined} onClick={run}>
          <Icon name="wand" />{sample.isPending ? 'Erzeuge …' : 'Beispielbeschreibung'}
        </button>
      ) : (
        <figure className="scene-sample" aria-label={`Beispielbeschreibung Szene ${scene.name}`}>
          <figcaption className="scene-label">So könnte es im Buch klingen</figcaption>
          <p>{text}</p>
          <div className="actions">
            <button type="button" disabled={sample.isPending} onClick={run}>{sample.isPending ? 'Erzeuge …' : 'Neu erzeugen'}</button>
            <button type="button" onClick={() => setText(null)}>Schließen</button>
          </div>
          <p className="muted">Nur eine Vorschau aus Bild und Notizen, wird nicht gespeichert.</p>
        </figure>
      )}
      {blocker && text === null && <p className="muted">{blocker}</p>}
      {sample.isError && <p className="error" role="alert">{descriptionErrorMessage(sample.error)}</p>}
    </div>
  );
}

/** One scene: name and notes saved on blur, image upload/remove, delete with confirmation. */
function SceneItem({ book, scene, sections, assignments, aiEnabled, fb, onOpenSection, onOpenStoryline }: ItemProps) {
  const bookId = book.id;
  const assign = useBookMutation<SceneTarget>(bookId, 'POST', () => `/api/books/${bookId}/scene-assignments`, (t) => ({
    sceneId: scene.id,
    // FR-005: a new assignment starts with the latest earlier description; the target can pick another one.
    description: previousDescriptions(scene.id, assignments)[0] ?? '',
    ...t,
  }));
  const targets = sceneTargets(book, scene.id, assignments);
  const base = `/api/books/${bookId}/scenes/${scene.id}`;
  const rename = useBookMutation<{ name: string }>(bookId, 'PATCH', () => base, (v) => v);
  const remove = useBookMutation<void>(bookId, 'DELETE', () => base);
  const addNote = useBookMutation<void>(bookId, 'POST', () => `${base}/notes`, () => ({ text: '' }));
  const saveNote = useBookMutation<{ id: Id; text: string }>(bookId, 'PATCH', (v) => `${base}/notes/${v.id}`, (v) => ({ text: v.text }));
  const removeNote = useBookMutation<{ id: Id }>(bookId, 'DELETE', (v) => `${base}/notes/${v.id}`);
  const removeImage = useBookMutation<void>(bookId, 'DELETE', () => `${base}/image`);
  const upload = useUploadSceneImage(bookId);
  const [imageError, setImageError] = useState<string | null>(null);
  const onError = fb.onError;

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    const problem = imageProblem(file);
    setImageError(problem);
    if (!problem) upload.mutate({ sceneId: scene.id, file }, { onError: (e) => setImageError(uploadErrorMessage(e)) });
  };

  const confirmDelete = () => {
    const extra = sections.length > 0 ? ` Sie wird aus ${sections.length} Abschnitt(en) entfernt.` : '';
    if (window.confirm(`Szene „${scene.name}“ löschen?${extra}`)) {
      fb.clear();
      remove.mutate(undefined, { onError });
    }
  };

  return (
    <li className="scene-item">
      <div className="scene-head">
        <input
          aria-label={`Name Szene ${scene.name}`}
          key={`${scene.name}-${fb.resetKey}`}
          maxLength={SCENE_LIMITS.name}
          defaultValue={scene.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name === '') e.target.value = scene.name;
            else if (name !== scene.name) {
              fb.clear();
              rename.mutate({ name }, { onError });
            }
          }}
        />
        <button type="button" className="icon-button" aria-label={`Szene „${scene.name}“ löschen`} title="Löschen" onClick={confirmDelete}>
          <Icon name="trash" />
        </button>
      </div>

      <div className="scene-image">
        {scene.image ? (
          <img src={sceneImageUrl(bookId, scene.id, scene.image.version)} alt={`Bild der Szene ${scene.name}`} />
        ) : (
          <p className="muted">Kein Bild.</p>
        )}
        <label className="file-button">
          {scene.image ? 'Bild ersetzen' : 'Bild wählen'}
          <input
            type="file"
            accept={SCENE_IMAGE_TYPES.join(',')}
            aria-label={`Bild für Szene ${scene.name} wählen`}
            onChange={(e) => {
              pickImage(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {scene.image && (
          <button type="button" onClick={() => removeImage.mutate(undefined, { onError })}>Bild entfernen</button>
        )}
        {upload.isPending && <span className="muted">Wird hochgeladen …</span>}
        {imageError && <p className="error" role="alert">{imageError}</p>}
      </div>

      <div className="scene-notes">
        <span className="scene-label">Notizen</span>
        {scene.notes.map((n, i) => (
          <div key={n.id} className="scene-note">
            <textarea
              aria-label={`Notiz ${i + 1} Szene ${scene.name}`}
              key={`${n.text}-${fb.resetKey}`}
              maxLength={SCENE_LIMITS.note}
              placeholder="Notiz"
              defaultValue={n.text}
              onBlur={(e) => {
                if (e.target.value.trim() !== n.text) saveNote.mutate({ id: n.id, text: e.target.value }, { onError });
              }}
            />
            <button type="button" className="icon-button" aria-label={`Notiz ${i + 1} der Szene „${scene.name}“ löschen`} title="Notiz löschen" onClick={() => removeNote.mutate({ id: n.id }, { onError })}>
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <button type="button" className="with-icon" aria-label={`Notiz zur Szene „${scene.name}“ hinzufügen`} onClick={() => addNote.mutate(undefined, { onError })}>
          <Icon name="plus" />Notiz
        </button>
      </div>

      <SceneSample bookId={bookId} scene={scene} aiEnabled={aiEnabled} />

      <div className="scene-usage">
        {sections.length === 0 ? (
          <p className="muted">Noch nirgends zugeordnet.</p>
        ) : (
          <>
            <span className="scene-label">Zugeordnet zu</span>
            <ul className="scene-sections">
              {sections.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    className="line-chip scene-section"
                    style={{ ['--line' as string]: a.color }}
                    aria-label={a.sectionId ? `Abschnitt „${a.title}“ öffnen` : `Storyline „${a.title}“ öffnen`}
                    disabled={a.sectionId ? !onOpenSection : !onOpenStoryline}
                    onClick={() => (a.sectionId ? onOpenSection?.(a.storylineId, a.sectionId) : onOpenStoryline?.(a.storylineId))}
                  >
                    {a.title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {targets.length > 0 && (
          <TargetSelect
            className="scene-assign-to"
            label={`Szene ${scene.name} zuordnen`}
            placeholder="Zuordnen zu …"
            groups={targets}
            onPick={(t) => { fb.clear(); assign.mutate(t, { onError }); }}
          />
        )}
      </div>
    </li>
  );
}

/** Places a scene is assigned to (sections and whole storylines), in the order of the assignments. */
function assignedSections(book: Book, sceneId: Id, assignments: SceneAssignment[]): AssignedSection[] {
  const byKey = new Map<string, AssignedSection>();
  for (const l of book.storylines) {
    const key = targetKey({ storylineId: l.id });
    byKey.set(key, { key, storylineId: l.id, sectionId: null, title: l.title, color: l.color });
    for (const s of l.sections) {
      const sk = targetKey({ sectionId: s.id });
      byKey.set(sk, { key: sk, storylineId: l.id, sectionId: s.id, title: s.title, color: l.color });
    }
  }
  return assignments.filter((a) => a.sceneId === sceneId).flatMap((a) => byKey.get(targetKey(a)) ?? []);
}

/** Panel listing the book's scenes. */
interface PanelProps {
  book: Book;
  scenes: Scene[];
  assignments: SceneAssignment[];
  aiEnabled?: boolean;
  onOpenSection?: (storylineId: Id, sectionId: Id) => void;
  /** Opens a storyline on its „Szenen“ tab. */
  onOpenStoryline?: (storylineId: Id) => void;
}

export function ScenePanel({ book, scenes, assignments, aiEnabled = false, onOpenSection, onOpenStoryline }: PanelProps) {
  const fb = useSaveFeedback();
  const create = useBookMutation<void>(book.id, 'POST', () => `/api/books/${book.id}/scenes`, () => ({ name: 'Neue Szene' }));
  return (
    <section aria-label="Szenen">
      <button type="button" className="with-icon" onClick={() => create.mutate(undefined, { onError: fb.onError })}>
        <Icon name="plus" />Szene
      </button>
      {fb.feedback}
      {scenes.length === 0 && (
        <p className="muted">Lege Szenen an, also Orte mit Bild und Notizen. Zuordnen kannst du sie hier mit „Zuordnen zu …“, einer Storyline im Reiter „Szenen“ oder einem Abschnitt beim Bearbeiten unter „Zeitpunkte“.</p>
      )}
      <ul className="panel-list scene-list">
        {scenes.map((s) => (
          <SceneItem
            key={s.id} book={book} scene={s} sections={assignedSections(book, s.id, assignments)} assignments={assignments}
            aiEnabled={aiEnabled} fb={fb} onOpenSection={onOpenSection} onOpenStoryline={onOpenStoryline}
          />
        ))}
      </ul>
    </section>
  );
}
