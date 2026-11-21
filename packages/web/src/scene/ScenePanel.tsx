/** Scene management tab: scenes with name, optional image and any number of notes (FR-001, FR-002). */
import { useState } from 'react';
import type { Book, Id, Scene, SceneAssignment } from '@bookly/shared';
import { SCENE_IMAGE_TYPES, SCENE_LIMITS } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback, type SaveFeedback } from '../book/saveFeedback';
import { Icon } from '../ui/Icon';
import { imageProblem, sceneImageUrl, uploadErrorMessage, useUploadSceneImage } from './sceneApi';

interface ItemProps {
  bookId: Id;
  scene: Scene;
  sectionTitles: string[];
  fb: SaveFeedback;
}

/** One scene: name and notes saved on blur, image upload/remove, delete with confirmation. */
function SceneItem({ bookId, scene, sectionTitles, fb }: ItemProps) {
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
    const extra = sectionTitles.length > 0 ? ` Sie wird aus ${sectionTitles.length} Abschnitt(en) entfernt.` : '';
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

      <p className="muted scene-usage">
        {sectionTitles.length > 0 ? `Zugeordnet zu: ${sectionTitles.join(', ')}` : 'Noch keinem Abschnitt zugeordnet.'}
      </p>
    </li>
  );
}

/** Titles of the sections a scene is assigned to, in the order of the assignments. */
function assignedSectionTitles(book: Book, sceneId: Id, assignments: SceneAssignment[]): string[] {
  const titles = new Map(book.storylines.flatMap((l) => l.sections.map((s) => [s.id, s.title] as const)));
  return assignments.filter((a) => a.sceneId === sceneId).map((a) => titles.get(a.sectionId) ?? '').filter((t) => t !== '');
}

/** Panel listing the book's scenes. */
export function ScenePanel({ book, scenes, assignments }: { book: Book; scenes: Scene[]; assignments: SceneAssignment[] }) {
  const fb = useSaveFeedback();
  const create = useBookMutation<void>(book.id, 'POST', () => `/api/books/${book.id}/scenes`, () => ({ name: 'Neue Szene' }));
  return (
    <section aria-label="Szenen">
      <button type="button" className="with-icon" onClick={() => create.mutate(undefined, { onError: fb.onError })}>
        <Icon name="plus" />Szene
      </button>
      {fb.feedback}
      {scenes.length === 0 && (
        <p className="muted">Lege Szenen an – Orte mit Bild und Notizen – und ordne sie im Storyline-Reiter einzelnen Abschnitten zu.</p>
      )}
      <ul className="panel-list scene-list">
        {scenes.map((s) => (
          <SceneItem key={s.id} bookId={book.id} scene={s} sectionTitles={assignedSectionTitles(book, s.id, assignments)} fb={fb} />
        ))}
      </ul>
    </section>
  );
}
