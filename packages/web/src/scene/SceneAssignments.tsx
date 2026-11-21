/**
 * Scenes of one target, a stored section or a whole storyline (e.g. a side strand): assign, describe
 * (by hand, from earlier ones or AI), move and remove (FR-003, FR-005, FR-006).
 */
import { useState } from 'react';
import type { Book, Id, Scene, SceneAssignment, SceneTarget } from '@bookly/shared';
import { hasSceneContext, parseTargetKey, previousDescriptions, targetKey } from '@bookly/shared';
import { useBook, useBookMutation } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import { Icon } from '../ui/Icon';
import { SceneBlocks } from './SceneBlocks';
import { descriptionErrorMessage, useSceneDescription } from './sceneApi';
import { useStaleNotice } from './staleNotice';
import { ProseField } from '../editor/ProseField';

/** Why "generate" is not available for a scene, or null when it is (EC-003). */
function generateBlocker(scene: Scene | undefined, aiEnabled: boolean): string | null {
  if (!aiEnabled) return 'KI nicht eingerichtet.';
  if (!scene || !hasSceneContext(scene)) return 'Die Szene braucht ein Bild oder eine Notiz.';
  return null;
}

/** Places a scene can go to, grouped by storyline; option values are target keys. */
export interface TargetGroup { storylineId: Id; title: string; options: { key: string; label: string }[] }

/** Every storyline (as a whole) and every section of the book, minus the places that already hold the scene. */
export function sceneTargets(book: Book, sceneId: Id, assignments: SceneAssignment[]): TargetGroup[] {
  const taken = new Set(assignments.filter((a) => a.sceneId === sceneId).map(targetKey));
  return book.storylines
    .map((l) => ({
      storylineId: l.id,
      title: l.title,
      options: [
        { key: targetKey({ storylineId: l.id }), label: l.kind === 'main' ? `Ganze Storyline „${l.title}“` : l.title },
        ...[...l.sections].sort((a, b) => a.order - b.order).map((s) => ({ key: targetKey({ sectionId: s.id }), label: s.title })),
      ].filter((o) => !taken.has(o.key)),
    }))
    .filter((g) => g.options.length > 0);
}

/** A select of target groups with a leading placeholder option. */
export function TargetSelect({ label, placeholder, groups, onPick, className }: { label: string; placeholder: string; groups: TargetGroup[]; onPick: (t: SceneTarget) => void; className?: string }) {
  return (
    <select className={className} aria-label={label} value="" onChange={(e) => { if (e.target.value) onPick(parseTargetKey(e.target.value)); }}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.storylineId} label={g.title}>
          {g.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Shortens a description for a select option. */
const preview = (p: string) => (p.length > 80 ? `${p.slice(0, 80)} …` : p);

interface RowProps {
  bookId: Id;
  target: SceneTarget;
  assignment: SceneAssignment;
  scene: Scene | undefined;
  aiEnabled: boolean;
  /** Earlier descriptions of the scene from its other assignments, newest first (FR-005). */
  earlier: string[];
  targets: TargetGroup[];
  onSave: (description: string) => void;
  onMove: (to: SceneTarget) => void;
  onRemove: () => void;
  resetKey: number;
}

/**
 * One assignment: its text as ordered blocks (SceneBlocks); "Neu erzeugen" or an earlier description from
 * the list puts a proposal into a single field, which the author takes over (replacing all blocks with its
 * paragraphs) or discards (Q-002: never generated without a click). "Verschieben nach" moves the assignment
 * with its text to another section.
 */
function AssignmentRow({ bookId, target, assignment, scene, aiEnabled, earlier, targets, onSave, onMove, onRemove, resetKey }: RowProps) {
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
      { sceneId: assignment.sceneId, ...target },
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
      {proposal ? (
        <ProseField
          ariaLabel={`Beschreibung Szene ${name}`}
          placeholder="Beschreibung der Szene in diesem Abschnitt"
          value={text}
          onChange={(value) => setText(value)}
        />
      ) : (
        <SceneBlocks bookId={bookId} assignment={assignment} aiEnabled={aiEnabled} name={name} />
      )}
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
        <TargetSelect className="scene-move" label={`Szene ${name} verschieben`} placeholder="Verschieben nach …" groups={targets} onPick={onMove} />
      )}
      {blocker && !proposal && <p className="muted">{blocker}</p>}
      {proposal && <p className="muted">Übernehmen ersetzt den ganzen Szenentext (alle Blöcke) durch diesen Text.</p>}
      {generate.isError && <p className="error" role="alert">{descriptionErrorMessage(generate.error)}</p>}
    </li>
  );
}

interface AddProps {
  bookId: Id;
  target: SceneTarget;
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
function AssignScene({ bookId, target, candidates, assignments, aiEnabled, onAssign }: AddProps) {
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

  if (candidates.length === 0) return <p className="muted">Alle Szenen sind hier schon zugeordnet, oder es gibt noch keine. Szenen legst du im Buch unter „Szenen“ an.</p>;

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
          <ProseField
            ariaLabel="Beschreibung der neuen Zuordnung"
            placeholder="Beschreibung der Szene in diesem Abschnitt"
            value={text}
            onChange={(value) => setText(value)}
          />
          <div className="actions">
            <button
              type="button"
              className="with-icon"
              disabled={blocker !== null || generate.isPending}
              title={blocker ?? undefined}
              onClick={() => generate.mutate({ sceneId: scene.id, ...target }, { onSuccess: (res) => setText(res.description) })}
            >
              <Icon name="wand" />
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

/** True when the assignment points at `target`. */
const isAt = (a: SceneAssignment, target: SceneTarget) => targetKey(a) === targetKey(target);

/** The scene block of a section's edit form or a storyline's „Szenen“ tab; reads scenes from the cached book response. */
export function SceneAssignments({ bookId, target, aiEnabled, legend = 'Szenen' }: { bookId: Id; target: SceneTarget; aiEnabled: boolean; legend?: string }) {
  const data = useBook(bookId).data;
  const fb = useSaveFeedback();
  const stale = useStaleNotice(bookId);
  const base = `/api/books/${bookId}/scene-assignments`;
  const create = useBookMutation<{ sceneId: Id; description: string }>(bookId, 'POST', () => base, (v) => ({ ...v, ...target }));
  const update = useBookMutation<{ id: Id; description: string; revision: number }>(bookId, 'PATCH', (v) => `${base}/${v.id}`, (v) => ({ description: v.description, revision: v.revision }));
  const move = useBookMutation<{ id: Id; to: SceneTarget }>(bookId, 'PATCH', (v) => `${base}/${v.id}`, (v) => v.to);
  const remove = useBookMutation<{ id: Id }>(bookId, 'DELETE', (v) => `${base}/${v.id}`);
  if (!data) return null;
  const scenes = data.scenes;
  const all = data.sceneAssignments;
  const own = all.filter((a) => isAt(a, target));
  const assigned = new Set(own.map((a) => a.sceneId));
  const onError = fb.onError;

  return (
    <fieldset className="scene-assignments">
      <legend>{legend}</legend>
      {fb.feedback}
      {stale.notice}
      {own.length > 0 && (
        <ul className="panel-list">
          {own.map((a) => (
            <AssignmentRow
              key={a.id}
              bookId={bookId}
              target={target}
              assignment={a}
              scene={scenes.find((s) => s.id === a.sceneId)}
              aiEnabled={aiEnabled}
              earlier={previousDescriptions(a.sceneId, all.filter((x) => x.id !== a.id)).filter((d) => d !== a.description)}
              targets={sceneTargets(data.book, a.sceneId, all)}
              resetKey={fb.resetKey}
              onSave={(description) => {
                fb.clear();
                stale.clear();
                update.mutate({ id: a.id, description, revision: a.revision }, { onError: (e) => { if (!stale.handle(e)) onError(e); } });
              }}
              onMove={(to) => { fb.clear(); move.mutate({ id: a.id, to }, { onError }); }}
              onRemove={() => { fb.clear(); remove.mutate({ id: a.id }, { onError }); }}
            />
          ))}
        </ul>
      )}
      <AssignScene
        bookId={bookId}
        target={target}
        candidates={scenes.filter((s) => !assigned.has(s.id))}
        assignments={all}
        aiEnabled={aiEnabled}
        onAssign={(v, done) => { fb.clear(); create.mutate(v, { onError, onSuccess: done }); }}
      />
    </fieldset>
  );
}
