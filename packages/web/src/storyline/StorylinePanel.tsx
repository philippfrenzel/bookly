/** Side panel form for creating and editing a storyline (explicit „Speichern“), with its sections. */
import { useState } from 'react';
import {
  KIND_DEFAULT_COLOR, STATUS_STYLE, type Book, type Id, type Storyline, type StorylineKind, type StorylineStatus,
  type TimeRange, type ValidationIssue,
} from '@bookly/shared';
import type { ApiError } from '../api/client';
import { useBookMutation, type BookResponse } from '../api/hooks';
import { IssueList } from '../book/IssueList';
import { CharacterChecks } from './CharacterChecks';
import { noteOrNull, validateWithStoryline } from './draft';
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

/** Local, unsaved form state. */
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

/** The form itself; remounted (by key) whenever the target changes. */
function StorylineForm({ book, initial, storyline, onTarget, onConnect }: FormProps) {
  const [draft, setDraft] = useState(initial);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const base = `/api/books/${book.id}/storylines`;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const create = useBookMutation<Record<string, unknown>>(book.id, 'POST', () => base, (v) => v);
  const update = useBookMutation<Record<string, unknown>>(book.id, 'PATCH', () => `${base}/${storyline?.id}`, (v) => v);
  const remove = useBookMutation<void>(book.id, 'DELETE', () => `${base}/${storyline?.id}`);

  const onError = (e: ApiError) => {
    const body = e.body as { issues?: ValidationIssue[] } | undefined;
    if (e.status === 422 && body?.issues) setIssues(body.issues);
  };

  const changeKind = (kind: StorylineKind) => {
    if (kind === draft.kind) return;
    const count = storyline?.sections.length ?? 0;
    if (storyline && draft.kind === 'main' && kind === 'side' && count > 0) {
      const ok = window.confirm(
        `Dieser Hauptstrang hat ${count} Abschnitte. Sie werden in die Notiz übernommen und entfernt. Fortfahren?`,
      );
      if (!ok) return;
    }
    // A colour still at the old default follows the kind.
    set({ kind, color: draft.color === KIND_DEFAULT_COLOR[draft.kind] ? KIND_DEFAULT_COLOR[kind] : draft.color });
  };

  const save = () => {
    const title = draft.title.trim();
    const candidate: Storyline = {
      id: storyline?.id ?? DRAFT_ID, title, description: draft.description, characterIds: draft.characterIds, range: draft.range,
      kind: draft.kind, status: draft.status, color: draft.color, note: noteOrNull(draft.note),
      sections: draft.kind === 'main' ? (storyline?.sections ?? []) : [],
    };
    const found = validateWithStoryline(book, candidate);
    setIssues(found);
    if (found.length > 0) return;
    const common = {
      title, description: draft.description, characterIds: draft.characterIds, range: draft.range, kind: draft.kind,
      note: candidate.note,
    };
    if (!storyline) {
      const body = draft.color === KIND_DEFAULT_COLOR[draft.kind] ? common : { ...common, color: draft.color };
      create.mutate(body, {
        onError,
        onSuccess: (res: BookResponse) => {
          const known = new Set(book.storylines.map((s) => s.id));
          const created = res.book.storylines.find((s) => !known.has(s.id));
          if (created) onTarget({ mode: 'edit', id: created.id });
        },
      });
    } else {
      const body = { ...common, status: draft.status, ...(draft.color !== storyline.color ? { color: draft.color } : {}) };
      update.mutate(body, { onError });
    }
  };

  const confirmDelete = () => {
    if (!storyline) return;
    const connections = book.connections.filter((c) => c.fromId === storyline.id || c.toId === storyline.id).length;
    if (window.confirm(`Storyline „${storyline.title}“ löschen? ${connections} Verbindungen werden ebenfalls entfernt.`)) {
      remove.mutate(undefined, { onError, onSuccess: () => onTarget(null) });
    }
  };

  return (
    <section aria-label="Storyline bearbeiten">
      <div className="storyline-form">
        <label>
          Titel
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          Kurzbeschreibung
          <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <fieldset>
          <legend>Art</legend>
          <div className="inline">
            <label className="inline">
              <input type="radio" name="kind" checked={draft.kind === 'main'} onChange={() => changeKind('main')} />
              Hauptstrang
            </label>
            <label className="inline">
              <input type="radio" name="kind" checked={draft.kind === 'side'} onChange={() => changeKind('side')} />
              Nebenstrang
            </label>
          </div>
        </fieldset>
        {storyline && (
          <label>
            Status
            <select value={draft.status} onChange={(e) => set({ status: e.target.value as StorylineStatus })}>
              {(Object.keys(STATUS_STYLE) as StorylineStatus[]).map((st) => (
                <option key={st} value={st}>{STATUS_STYLE[st].label}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Farbe
          <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
        <div className="field">
          <span>Zeitraum</span>
          <RangePicker label="Zeitraum" timePoints={book.timePoints} value={draft.range} onChange={(range) => set({ range })} />
        </div>
        <fieldset>
          <legend>Figuren</legend>
          <CharacterChecks characters={book.characters} value={draft.characterIds} onChange={(characterIds) => set({ characterIds })} />
        </fieldset>
        <label>
          Notiz
          <textarea value={draft.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
        <IssueList issues={issues} />
        <div className="actions">
          <button type="button" onClick={save}>Speichern</button>
          {storyline && <button type="button" onClick={confirmDelete}>Löschen</button>}
        </div>
      </div>
      {storyline && onConnect && <ConnectPicker book={book} fromId={storyline.id} onConnect={onConnect} />}
      {storyline && storyline.kind === 'main' && <SectionList book={book} storyline={storyline} />}
    </section>
  );
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
