/** Side panel form for creating and editing a storyline (direct saves; „Anlegen“ when creating), with its sections. */
import { useState } from 'react';
import {
  KIND_DEFAULT_COLOR, STATUS_STYLE, type Book, type Id, type Storyline, type StorylineKind, type StorylineStatus,
  type TimeRange, type BookResponse,
} from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import { CharacterChecks } from './CharacterChecks';
import { noteOrNull, validateWithStoryline } from './draft';
import { ColorInput, TextInput } from './fields';
import { RangePicker } from './RangePicker';
import { SectionList } from './SectionList';

/** What the panel shows: nothing, a blank form (optionally with a prefilled range) or an existing storyline. */
export type PanelTarget =
  | null
  | { mode: 'create'; range?: TimeRange; nonce: number }
  | { mode: 'edit'; id: Id };

interface Props {
  book: Book;
  target: PanelTarget;
  /** Called with a new target after create (edit the new storyline) or delete (null). */
  onTarget: (target: PanelTarget) => void;
  /** Opens the connection dialog from the given storyline to another. */
  onConnect?: (fromId: Id, toId: Id) => void;
}

/** Form values: the local draft when creating, a view of the stored storyline when editing. */
interface Draft {
  title: string;
  description: string;
  kind: StorylineKind;
  status: StorylineStatus;
  color: string;
  range: TimeRange;
  characterIds: Id[];
  note: string;
}

const DRAFT_ID = 'draft';

/** Line colours offered as one-click swatches; the first two are the default main and side colours. */
const LINE_COLORS = [
  { name: 'Hauptblau', hex: KIND_DEFAULT_COLOR.main },
  { name: 'Nebengrau', hex: KIND_DEFAULT_COLOR.side },
  { name: 'Grün', hex: '#00A651' },
  { name: 'Gelb', hex: '#F7A600' },
  { name: 'Rotbraun', hex: '#A0522D' },
  { name: 'Violett', hex: '#9B3D97' },
  { name: 'Türkis', hex: '#0098A1' },
  { name: 'Hellblau', hex: '#5AA5DC' },
];

/** Picks the form for the target, or a hint when nothing is selected. */
export function StorylinePanel({ book, target, onTarget, onConnect }: Props) {
  if (target?.mode === 'create') {
    const first = [...book.timePoints].sort((a, b) => a.position - b.position)[0];
    if (!first) return <p className="muted">Lege zuerst Zeitpunkte an.</p>;
    const range = target.range ?? { startId: first.id, endId: first.id };
    const draft: Draft = {
      title: '', description: '', kind: 'main', status: 'in_progress', color: KIND_DEFAULT_COLOR.main, range, characterIds: [], note: '',
    };
    return <StorylineForm key={`new-${target.nonce}`} book={book} initial={draft} storyline={null} onTarget={onTarget} />;
  }
  const storyline = target?.mode === 'edit' ? book.storylines.find((s) => s.id === target.id) : undefined;
  if (!storyline) return <p className="muted">Wähle eine Storyline in der Karte oder lege eine neue an.</p>;
  const draft: Draft = {
    title: storyline.title, description: storyline.description, kind: storyline.kind, status: storyline.status,
    color: storyline.color, range: storyline.range, characterIds: storyline.characterIds, note: storyline.note ?? '',
  };
  return <StorylineForm key={storyline.id} book={book} initial={draft} storyline={storyline} onTarget={onTarget} onConnect={onConnect} />;
}

interface FormProps {
  book: Book;
  initial: Draft;
  /** The stored storyline, or null when creating. */
  storyline: Storyline | null;
  onTarget: (target: PanelTarget) => void;
  onConnect?: (fromId: Id, toId: Id) => void;
}

/** The form itself; remounted (by key) whenever the target changes. Create: local draft + „Anlegen“. Edit: direct saves. */
function StorylineForm({ book, initial, storyline, onTarget, onConnect }: FormProps) {
  const [draft, setDraft] = useState(initial);
  const fb = useSaveFeedback();
  const base = `/api/books/${book.id}/storylines`;
  const editing = storyline !== null;
  // Edit forms always show the stored values, so a rejected change falls back by itself.
  const v: Draft = storyline ? draftOf(storyline) : draft;

  const create = useBookMutation<Record<string, unknown>>(book.id, 'POST', () => base, (x) => x);
  const update = useBookMutation<Record<string, unknown>>(book.id, 'PATCH', () => `${base}/${storyline?.id}`, (x) => x);
  const remove = useBookMutation<void>(book.id, 'DELETE', () => `${base}/${storyline?.id}`);

  /** Request body fields for a partial change. */
  const bodyOf = (patch: Partial<Draft>): Record<string, unknown> => {
    const body: Record<string, unknown> = { ...patch };
    if (patch.title !== undefined) body.title = patch.title.trim();
    if (patch.note !== undefined) body.note = noteOrNull(patch.note);
    return body;
  };

  /** Edit mode: validates the changed field locally, then PATCHes just that field. */
  const saveField = (patch: Partial<Draft>) => {
    if (!storyline) return;
    if (patch.title !== undefined && patch.title.trim() === '') {
      fb.reject([]);
      return;
    }
    const next = { ...draftOf(storyline), ...patch };
    const candidate: Storyline = {
      ...storyline, title: next.title.trim(), description: next.description, characterIds: next.characterIds, range: next.range,
      kind: next.kind, status: next.status, color: next.color, note: noteOrNull(next.note),
      sections: next.kind === 'main' ? storyline.sections : [],
    };
    const found = validateWithStoryline(book, candidate);
    if (found.length > 0) {
      fb.reject(found);
      return;
    }
    fb.clear();
    update.mutate(bodyOf(patch), { onError: fb.onError });
  };

  /** Create mode edits the draft; edit mode saves directly. */
  const commit = (patch: Partial<Draft>) => (editing ? saveField(patch) : setDraft((d) => ({ ...d, ...patch })));

  const changeKind = (kind: StorylineKind) => {
    if (kind === v.kind) return;
    const count = storyline?.sections.length ?? 0;
    if (storyline && v.kind === 'main' && kind === 'side' && count > 0) {
      const ok = window.confirm(
        `Dieser Hauptstrang hat ${count} Abschnitte. Sie werden in die Notiz übernommen und entfernt. Fortfahren?`,
      );
      if (!ok) return;
    }
    if (editing) {
      saveField({ kind });
      return;
    }
    // A colour still at the old default follows the kind.
    setDraft((d) => ({ ...d, kind, color: d.color === KIND_DEFAULT_COLOR[d.kind] ? KIND_DEFAULT_COLOR[kind] : d.color }));
  };

  /** Create mode: validates the draft locally and POSTs it. */
  const submitCreate = () => {
    const title = draft.title.trim();
    const candidate: Storyline = {
      id: DRAFT_ID, title, description: draft.description, characterIds: draft.characterIds, range: draft.range,
      kind: draft.kind, status: draft.status, color: draft.color, note: noteOrNull(draft.note), sections: [],
    };
    const found = validateWithStoryline(book, candidate);
    if (found.length > 0) {
      fb.reject(found);
      return;
    }
    fb.clear();
    const common = {
      title, description: draft.description, characterIds: draft.characterIds, range: draft.range, kind: draft.kind,
      note: candidate.note,
    };
    const body = draft.color === KIND_DEFAULT_COLOR[draft.kind] ? common : { ...common, color: draft.color };
    create.mutate(body, {
      onError: fb.onError,
      onSuccess: (res: BookResponse) => {
        const known = new Set(book.storylines.map((s) => s.id));
        const created = res.book.storylines.find((s) => !known.has(s.id));
        if (created) onTarget({ mode: 'edit', id: created.id });
      },
    });
  };

  const confirmDelete = () => {
    if (!storyline) return;
    const connections = book.connections.filter((c) => c.fromId === storyline.id || c.toId === storyline.id).length;
    if (window.confirm(`Storyline „${storyline.title}“ löschen? ${connections} Verbindungen werden ebenfalls entfernt.`)) {
      fb.clear();
      remove.mutate(undefined, { onError: fb.onError, onSuccess: () => onTarget(null) });
    }
  };

  const text = { live: !editing, resetKey: fb.resetKey };
  return (
    <section aria-label="Storyline bearbeiten">
      <div className="storyline-form">
        <label>
          Titel
          <TextInput {...text} value={v.title} maxLength={200} onCommit={(title) => commit({ title })} />
        </label>
        <label>
          Kurzbeschreibung
          <TextInput {...text} multiline value={v.description} maxLength={2000} onCommit={(description) => commit({ description })} />
        </label>
        <fieldset>
          <legend>Art</legend>
          <div className="inline">
            <label className="inline">
              <input type="radio" name="kind" checked={v.kind === 'main'} onChange={() => changeKind('main')} />
              Hauptstrang
            </label>
            <label className="inline">
              <input type="radio" name="kind" checked={v.kind === 'side'} onChange={() => changeKind('side')} />
              Nebenstrang
            </label>
          </div>
        </fieldset>
        {editing && (
          <label>
            Status
            <select value={v.status} onChange={(e) => commit({ status: e.target.value as StorylineStatus })}>
              {(Object.keys(STATUS_STYLE) as StorylineStatus[]).map((st) => (
                <option key={st} value={st}>{STATUS_STYLE[st].label}</option>
              ))}
            </select>
          </label>
        )}
        <div className="field">
          <span>Farbe</span>
          <div className="line-colors">
            <ColorInput {...text} ariaLabel="Farbe" value={v.color} onCommit={(color) => commit({ color })} />
            {LINE_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={`swatch${v.color.toLowerCase() === c.hex.toLowerCase() ? ' is-current' : ''}`}
                style={{ background: c.hex }}
                aria-label={`Linienfarbe ${c.name}`}
                aria-pressed={v.color.toLowerCase() === c.hex.toLowerCase()}
                title={c.name}
                onClick={() => commit({ color: c.hex })}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span>Zeitraum</span>
          <RangePicker label="Zeitraum" timePoints={book.timePoints} value={v.range} onChange={(range) => commit({ range })} />
        </div>
        <fieldset>
          <legend>Figuren</legend>
          <CharacterChecks characters={book.characters} value={v.characterIds} onChange={(characterIds) => commit({ characterIds })} />
        </fieldset>
        <label>
          Notiz
          <TextInput {...text} multiline value={v.note} maxLength={10000} onCommit={(note) => commit({ note })} />
        </label>
        {fb.feedback}
        <div className="actions">
          {editing ? (
            <button type="button" onClick={confirmDelete}>Löschen</button>
          ) : (
            <button type="button" onClick={submitCreate}>Anlegen</button>
          )}
        </div>
      </div>
      {storyline && onConnect && <ConnectPicker book={book} fromId={storyline.id} onConnect={onConnect} />}
      {storyline && storyline.kind === 'main' && <SectionList book={book} storyline={storyline} />}
    </section>
  );
}

/** Form values of a stored storyline. */
function draftOf(s: Storyline): Draft {
  return {
    title: s.title, description: s.description, kind: s.kind, status: s.status, color: s.color, range: s.range,
    characterIds: s.characterIds, note: s.note ?? '',
  };
}

/** Accessible alternative to dragging a bar handle: pick the target strand and open the connection dialog. */
function ConnectPicker({ book, fromId, onConnect }: { book: Book; fromId: Id; onConnect: (fromId: Id, toId: Id) => void }) {
  const [toId, setToId] = useState('');
  return (
    <div className="connect-picker inline">
      <label>
        Verbinden mit …
        <select value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="" />
          {book.storylines.filter((s) => s.id !== fromId).map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!toId} onClick={() => onConnect(fromId, toId)}>Verbinden</button>
    </div>
  );
}
