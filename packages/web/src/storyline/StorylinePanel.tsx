/**
 * Side panel form for creating and editing a storyline (direct saves; „Anlegen“ when creating).
 * A stored storyline is split into the sub-tabs Storyline (facts, note, connections), Figuren and Zeitpunkte (sections).
 */
import { useState } from 'react';
import {
  KIND_DEFAULT_COLOR, STATUS_STYLE, type Book, type Id, type Storyline, type StorylineKind, type StorylineStatus,
  type TimeRange, type BookResponse, type CharacterCheck,
} from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import { CharacterChecks } from './CharacterChecks';
import { CheckStatus } from './CheckStatus';
import { noteOrNull, validateWithStoryline } from './draft';
import { ColorInput, TextInput } from './fields';
import { RangePicker } from './RangePicker';
import { SectionList } from './SectionList';
import { StorylineConnections } from './StorylineConnections';
import { StorylineHeader, StorylineTabBar, storylineTabs, type StorylineTab } from './StorylineHeader';
import { StatusGlyph } from '../map/icons';
import { LINE_PALETTE, nextLineColor } from '../map/linePalette';

/** A request from outside (the timetable) to open one section, or the add form when `id` is null. */
export interface SectionFocus { id: Id | null; nonce: number }

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
  /** AI check rows of the book; the one of the shown storyline drives the status line. */
  checks?: CharacterCheck[];
  aiEnabled?: boolean;
  /** Shown sub-tab of a stored storyline; uncontrolled when omitted. */
  tab?: StorylineTab;
  onTab?: (tab: StorylineTab) => void;
  /** Section to open for editing in the „Zeitpunkte“ tab (null id: the add form); a new nonce opens it again. */
  focusSection?: SectionFocus | null;
  /** Opens an existing connection. */
  onOpenConnection?: (connectionId: Id) => void;
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

/** Picks the form for the target, or a hint when nothing is selected. */
export function StorylinePanel({ book, target, onTarget, onConnect, checks = [], aiEnabled = false, tab, onTab, focusSection, onOpenConnection }: Props) {
  const [ownTab, setOwnTab] = useState<StorylineTab>('details');
  if (target?.mode === 'create') {
    const first = [...book.timePoints].sort((a, b) => a.position - b.position)[0];
    if (!first) return <p className="muted">Lege zuerst Zeitpunkte an.</p>;
    const range = target.range ?? { startId: first.id, endId: first.id };
    const draft: Draft = {
      title: '', description: '', kind: 'main', status: 'in_progress', color: nextLineColor(book, 'main'), range, characterIds: [], note: '',
    };
    return <StorylineForm key={`new-${target.nonce}`} book={book} initial={draft} storyline={null} onTarget={onTarget} aiEnabled={aiEnabled} />;
  }
  const storyline = target?.mode === 'edit' ? book.storylines.find((s) => s.id === target.id) : undefined;
  if (!storyline) return <p className="muted">Wähle eine Storyline in der Karte oder lege eine neue an.</p>;
  const draft: Draft = {
    title: storyline.title, description: storyline.description, kind: storyline.kind, status: storyline.status,
    color: storyline.color, range: storyline.range, characterIds: storyline.characterIds, note: storyline.note ?? '',
  };
  return (
    <StorylineForm
      key={storyline.id} book={book} initial={draft} storyline={storyline} onTarget={onTarget} onConnect={onConnect}
      check={checks.find((c) => c.storylineId === storyline.id)} aiEnabled={aiEnabled}
      tab={tab ?? ownTab} onTab={(t) => { setOwnTab(t); onTab?.(t); }} focusSection={focusSection ?? null}
      onOpenConnection={onOpenConnection}
    />
  );
}

interface FormProps {
  book: Book;
  initial: Draft;
  /** The stored storyline, or null when creating. */
  storyline: Storyline | null;
  onTarget: (target: PanelTarget) => void;
  onConnect?: (fromId: Id, toId: Id) => void;
  check?: CharacterCheck;
  aiEnabled: boolean;
  tab?: StorylineTab;
  onTab?: (tab: StorylineTab) => void;
  focusSection?: SectionFocus | null;
  onOpenConnection?: (connectionId: Id) => void;
}

/** The form itself; remounted (by key) whenever the target changes. Create: local draft + „Anlegen“. Edit: direct saves. */
function StorylineForm({ book, initial, storyline, onTarget, onConnect, check, aiEnabled, tab = 'details', onTab, focusSection = null, onOpenConnection }: FormProps) {
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
    // A colour still at the automatic pick follows the kind.
    setDraft((d) => ({ ...d, kind, color: d.color === nextLineColor(book, d.kind) ? nextLineColor(book, kind) : d.color }));
  };

  /** Create mode: validates the draft locally and POSTs it. */
  const submitCreate = () => {
    const title = draft.title.trim();
    const candidate: Storyline = {
      id: DRAFT_ID, title, description: draft.description, characterIds: draft.characterIds, range: draft.range,
      kind: draft.kind, status: draft.status, color: draft.color, note: noteOrNull(draft.note), additions: [], sections: [],
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
    const body = { ...common, color: draft.color };
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
  /** Wand configuration for one text field; the draft is read when the wand asks. */
  const aiFor = (field: 'title' | 'description' | 'note') => ({
    bookId: book.id,
    target: { kind: 'storyline' as const, storylineId: storyline?.id ?? null, field },
    draft: () => ({ title: v.title, description: v.description, note: v.note, characterIds: v.characterIds }),
    enabled: aiEnabled,
  });
  // A tab the storyline does not have (e.g. „Zeitpunkte“ of a side strand) falls back to the facts.
  const active: StorylineTab = storyline && storylineTabs(storyline).some((t) => t.id === tab) ? tab : 'details';
  /** Create mode shows everything at once; edit mode only the active group. */
  const shows = (group: StorylineTab) => !editing || active === group;
  return (
    <section aria-label="Storyline bearbeiten" className="storyline-panel">
      {storyline && <StorylineHeader book={book} storyline={storyline} />}
      {storyline && onTab && <StorylineTabBar storyline={storyline} active={active} onChange={onTab} />}
      <div className="storyline-form" role={storyline ? 'tabpanel' : undefined}>
        {shows('details') && (<>
        <div className="field">
          <span>Titel</span>
          <TextInput {...text} ariaLabel="Titel" ai={aiFor('title')} value={v.title} maxLength={200} onCommit={(title) => commit({ title })} />
        </div>
        <div className="field">
          <span>Kurzbeschreibung</span>
          <TextInput
            {...text} multiline ariaLabel="Kurzbeschreibung" ai={aiFor('description')} value={v.description} maxLength={2000}
            onCommit={(description) => commit({ description })}
          />
        </div>
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
          <fieldset className="status-options">
            <legend>Status</legend>
            {(Object.keys(STATUS_STYLE) as StorylineStatus[]).map((st) => (
              <label key={st} className={`status-option${v.status === st ? ' is-current' : ''}`}>
                <input type="radio" name="status" value={st} checked={v.status === st} onChange={() => commit({ status: st })} />
                <svg className="status-disc" width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true">
                  <circle r="9" fill="#fff" stroke={STATUS_STYLE[st].color} strokeWidth="2.5" />
                  <StatusGlyph status={st} x={0} y={0} color={STATUS_STYLE[st].color} />
                </svg>
                {STATUS_STYLE[st].label}
              </label>
            ))}
          </fieldset>
        )}
        <div className="field">
          <span>Farbe</span>
          <div className="line-colors">
            <ColorInput {...text} ariaLabel="Farbe" value={v.color} onCommit={(color) => commit({ color })} />
            {LINE_PALETTE[v.kind].map((c) => (
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
        </>)}
        {shows('characters') && (
        <fieldset>
          <legend>Figuren</legend>
          {storyline && <CheckStatus bookId={book.id} storylineId={storyline.id} check={check} aiEnabled={aiEnabled} />}
          <CharacterChecks
            characters={book.characters} value={v.characterIds} onChange={(characterIds) => commit({ characterIds })}
            storyline={storyline ?? undefined} bookId={book.id} aiEnabled={aiEnabled}
          />
        </fieldset>
        )}
        {shows('details') && (
        <div className="field">
          <span>Notiz</span>
          <TextInput
            {...text} multiline ariaLabel="Notiz" ai={aiFor('note')} value={v.note} maxLength={10000}
            onCommit={(note) => commit({ note })}
          />
        </div>
        )}
        {fb.feedback}
        {!editing && (
          <div className="actions">
            <button type="button" onClick={submitCreate}>Anlegen</button>
          </div>
        )}
      </div>
      {storyline && shows('details') && onConnect && (
        <StorylineConnections book={book} storylineId={storyline.id} onConnect={onConnect} onOpen={onOpenConnection} />
      )}
      {storyline && shows('details') && (
        <div className="actions storyline-delete">
          <button type="button" className="danger-quiet" onClick={confirmDelete}>Löschen</button>
        </div>
      )}
      {storyline && storyline.kind === 'main' && shows('timeline') && (
        <SectionList
          key={focusSection ? `${focusSection.id ?? 'new'}-${focusSection.nonce}` : 'none'}
          book={book} storyline={storyline} aiEnabled={aiEnabled}
          focusId={focusSection?.id ?? null} startAdding={focusSection !== null && focusSection.id === null}
        />
      )}
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
