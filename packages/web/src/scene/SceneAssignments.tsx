/** Scenes of one stored section: assign, describe (by hand, from earlier ones or AI), move and remove (FR-003, FR-005, FR-006). */
import { useState } from 'react';
import type { Book, Id, Scene, SceneAssignment } from '@bookly/shared';
import { hasSceneContext, previousDescriptions, SCENE_LIMITS } from '@bookly/shared';
import { useBook, useBookMutation } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import { descriptionErrorMessage, useSceneDescription } from './sceneApi';

/** Why "generate" is not available for a scene, or null when it is (EC-003). */
function generateBlocker(scene: Scene | undefined, aiEnabled: boolean): string | null {
  if (!aiEnabled) return 'KI nicht eingerichtet.';
  if (!scene || !hasSceneContext(scene)) return 'Die Szene braucht ein Bild oder eine Notiz.';
  return null;
}

/** Sections an assignment can move to, grouped by storyline. */
interface MoveGroup { storylineId: Id; title: string; sections: { id: Id; title: string }[] }

/** All sections of the book except `sectionId` and those that already hold the scene. */
function moveTargets(book: Book, sceneId: Id, sectionId: Id, assignments: SceneAssignment[]): MoveGroup[] {
  const taken = new Set(assignments.filter((a) => a.sceneId === sceneId).map((a) => a.sectionId));
  return book.storylines
    .map((l) => ({
      storylineId: l.id,
      title: l.title,
      sections: [...l.sections].sort((a, b) => a.order - b.order).filter((s) => s.id !== sectionId && !taken.has(s.id)).map((s) => ({ id: s.id, title: s.title })),
    }))
    .filter((g) => g.sections.length > 0);
}

/** Shortens a description for a select option. */
const preview = (p: string) => (p.length > 80 ? `${p.slice(0, 80)} …` : p);

interface RowProps {
  bookId: Id;
  sectionId: Id;
  assignment: SceneAssignment;
  scene: Scene | undefined;
  aiEnabled: boolean;
  /** Earlier descriptions of the scene from its other assignments, newest first (FR-005). */
  earlier: string[];
  targets: MoveGroup[];
  onSave: (description: string) => void;
  onMove: (sectionId: Id) => void;
  onRemove: () => void;
  resetKey: number;
}

/**
 * One assignment: description saved on blur; "Neu erzeugen" or an earlier description from the list
 * puts a proposal into the field, which the author takes over or discards (Q-002: never generated
 * without a click). "Verschieben nach" moves the assignment with its description to another section.
 */
function AssignmentRow({ bookId, sectionId, assignment, scene, aiEnabled, earlier, targets, onSave, onMove, onRemove, resetKey }: RowProps) {
  const name = scene?.name ?? 'Szene';
  const [text, setText] = useState(assignment.description);
  const [proposal, setProposal] = useState(false);
  const [lastKey, setLastKey] = useState({ description: assignment.description, resetKey });
  if (lastKey.description !== assignment.description || lastKey.resetKey !== resetKey) {
    setLastKey({ description: assignment.description, resetKey });
    setText(assignment.description);
    setProposal(false);
  }
  const generate = useSceneDescription(bookId);
  const blocker = generateBlocker(scene, aiEnabled);

  const regenerate = () =>
    generate.mutate(
      { sceneId: assignment.sceneId, sectionId },
      {
        onSuccess: (res) => {
          setText(res.description);
          setProposal(true);
        },
      },
    );

  return (
    <li className="scene-assignment">
      <span className="scene-label">{name}</span>
      <textarea
        aria-label={`Beschreibung Szene ${name}`}
        maxLength={SCENE_LIMITS.description}
        placeholder="Beschreibung der Szene in diesem Abschnitt"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!proposal && text.trim() !== assignment.description) onSave(text);
        }}
      />
      {!proposal && earlier.length > 0 && (
        <select aria-label={`Frühere Beschreibung für Szene ${name} einsetzen`} value="" onChange={(e) => {
          const chosen = earlier[Number(e.target.value)];
          if (chosen !== undefined) { setText(chosen); setProposal(true); }
        }}>
          <option value="">Frühere Beschreibung einsetzen …</option>
          {earlier.map((p, i) => <option key={i} value={i}>{preview(p)}</option>)}
        </select>
      )}
      <div className="actions">
        {proposal ? (
          <>
            <button type="button" className="primary" onClick={() => { setProposal(false); onSave(text); }}>Übernehmen</button>
            <button type="button" onClick={() => { setProposal(false); setText(assignment.description); }}>Verwerfen</button>
          </>
        ) : (
          <button type="button" disabled={blocker !== null || generate.isPending} title={blocker ?? undefined} onClick={regenerate}>
            {generate.isPending ? 'Erzeuge …' : 'Neu erzeugen'}
          </button>
        )}
        <button type="button" aria-label={`Szene „${name}“ aus diesem Abschnitt entfernen`} onClick={onRemove}>Entfernen</button>
      </div>
      {targets.length > 0 && (
        <select className="scene-move" aria-label={`Szene ${name} in anderen Abschnitt verschieben`} value="" onChange={(e) => { if (e.target.value) onMove(e.target.value); }}>
          <option value="">Verschieben nach …</option>
          {targets.map((g) => (
            <optgroup key={g.storylineId} label={g.title}>
              {g.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </optgroup>
          ))}
        </select>
      )}
      {blocker && !proposal && <p className="muted">{blocker}</p>}
      {generate.isError && <p className="error" role="alert">{descriptionErrorMessage(generate.error)}</p>}
    </li>
  );
}

interface AddProps {
  bookId: Id;
  sectionId: Id;
  candidates: Scene[];
  assignments: SceneAssignment[];
  aiEnabled: boolean;
  onAssign: (v: { sceneId: Id; description: string }, done: () => void) => void;
}

/**
 * Form to assign a scene: the latest earlier description is inserted (FR-005), several earlier ones
 * are offered as a list, and the author may generate a new one instead (FR-006). Nothing is
 * generated without a click; a first assignment starts empty (HDR-001).
 */
function AssignScene({ bookId, sectionId, candidates, assignments, aiEnabled, onAssign }: AddProps) {
  const [sceneId, setSceneId] = useState<Id | ''>('');
  const [text, setText] = useState('');
  const generate = useSceneDescription(bookId);
  const scene = candidates.find((s) => s.id === sceneId);
  const previous = sceneId ? previousDescriptions(sceneId, assignments) : [];
  const blocker = generateBlocker(scene, aiEnabled);

  const choose = (id: Id | '') => {
    setSceneId(id);
    setText(id ? previousDescriptions(id, assignments)[0] ?? '' : '');
    generate.reset();
  };

  if (candidates.length === 0) return <p className="muted">Alle Szenen sind diesem Abschnitt schon zugeordnet, oder es gibt noch keine. Szenen legst du im Buch unter „Szenen“ an.</p>;

  return (
    <div className="scene-assign">
      <label className="field">
        <span>Szene zuordnen</span>
        <select aria-label="Szene zuordnen" value={sceneId} onChange={(e) => choose(e.target.value)}>
          <option value="">Szene wählen …</option>
          {candidates.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {scene && (
        <>
          {previous.length > 1 && (
            <label className="field">
              <span>Bisherige Beschreibungen</span>
              <select key={sceneId} aria-label="Bisherige Beschreibung wählen" defaultValue="0" onChange={(e) => setText(previous[Number(e.target.value)] ?? '')}>
                {previous.map((p, i) => (
                  <option key={i} value={i}>{preview(p)}</option>
                ))}
              </select>
            </label>
          )}
          {previous.length === 0 && <p className="muted">Diese Szene hat noch keine Beschreibung.</p>}
          <textarea
            aria-label="Beschreibung der neuen Zuordnung"
            maxLength={SCENE_LIMITS.description}
            placeholder="Beschreibung der Szene in diesem Abschnitt"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="actions">
            <button
              type="button"
              disabled={blocker !== null || generate.isPending}
              title={blocker ?? undefined}
              onClick={() => generate.mutate({ sceneId: scene.id, sectionId }, { onSuccess: (res) => setText(res.description) })}
            >
              {generate.isPending ? 'Erzeuge …' : 'Beschreibung erzeugen'}
            </button>
            <button type="button" className="primary" onClick={() => onAssign({ sceneId: scene.id, description: text }, () => choose(''))}>Zuordnen</button>
          </div>
          {blocker && <p className="muted">{blocker}</p>}
          {generate.isError && <p className="error" role="alert">{descriptionErrorMessage(generate.error)}</p>}
        </>
      )}
    </div>
  );
}

/** The scene block inside the edit form of a stored section; reads scenes from the cached book response. */
export function SceneAssignments({ bookId, sectionId, aiEnabled }: { bookId: Id; sectionId: Id; aiEnabled: boolean }) {
  const data = useBook(bookId).data;
  const fb = useSaveFeedback();
  const base = `/api/books/${bookId}/scene-assignments`;
  const create = useBookMutation<{ sceneId: Id; description: string }>(bookId, 'POST', () => base, (v) => ({ ...v, sectionId }));
  const update = useBookMutation<{ id: Id; description: string }>(bookId, 'PATCH', (v) => `${base}/${v.id}`, (v) => ({ description: v.description }));
  const move = useBookMutation<{ id: Id; sectionId: Id }>(bookId, 'PATCH', (v) => `${base}/${v.id}`, (v) => ({ sectionId: v.sectionId }));
  const remove = useBookMutation<{ id: Id }>(bookId, 'DELETE', (v) => `${base}/${v.id}`);
  if (!data) return null;
  const scenes = data.scenes;
  const all = data.sceneAssignments;
  const own = all.filter((a) => a.sectionId === sectionId);
  const assigned = new Set(own.map((a) => a.sceneId));
  const onError = fb.onError;

  return (
    <fieldset className="scene-assignments">
      <legend>Szenen</legend>
      {fb.feedback}
      {own.length > 0 && (
        <ul className="panel-list">
          {own.map((a) => (
            <AssignmentRow
              key={a.id}
              bookId={bookId}
              sectionId={sectionId}
              assignment={a}
              scene={scenes.find((s) => s.id === a.sceneId)}
              aiEnabled={aiEnabled}
              earlier={previousDescriptions(a.sceneId, all.filter((x) => x.id !== a.id)).filter((d) => d !== a.description)}
              targets={moveTargets(data.book, a.sceneId, sectionId, all)}
              resetKey={fb.resetKey}
              onSave={(description) => { fb.clear(); update.mutate({ id: a.id, description }, { onError }); }}
              onMove={(to) => { fb.clear(); move.mutate({ id: a.id, sectionId: to }, { onError }); }}
              onRemove={() => { fb.clear(); remove.mutate({ id: a.id }, { onError }); }}
            />
          ))}
        </ul>
      )}
      <AssignScene
        bookId={bookId}
        sectionId={sectionId}
        candidates={scenes.filter((s) => !assigned.has(s.id))}
        assignments={all}
        aiEnabled={aiEnabled}
        onAssign={(v, done) => { fb.clear(); create.mutate(v, { onError, onSuccess: done }); }}
      />
    </fieldset>
  );
}
