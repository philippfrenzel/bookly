/** Sections of a main strand: ordered list with reorder, add (button), direct-save editing and delete. */
import { useState } from 'react';
import type { Book, Id, Section, Storyline, TimeRange } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import { CharacterChecks } from './CharacterChecks';
import { noteOrNull, validateWithStoryline } from './draft';
import { TextInput } from './fields';
import { RangePicker } from './RangePicker';

/** Editable fields of a section. */
interface SectionDraft {
  title: string;
  description: string;
  range: TimeRange;
  characterIds: Id[];
  note: string;
}

interface FieldsProps {
  book: Book;
  /** Used in accessible names, e.g. „neuer Abschnitt“ or the section title. */
  name: string;
  values: SectionDraft;
  /** True for the add form (local draft), false for stored sections (direct saves). */
  live: boolean;
  resetKey: number;
  onCommit: (patch: Partial<SectionDraft>) => void;
}

/** The section input fields; commit semantics depend on `live`. */
function SectionFields({ book, name, values, live, resetKey, onCommit }: FieldsProps) {
  const text = { live, resetKey };
  return (
    <>
      <div className="field">
        <span>Titel</span>
        <TextInput {...text} ariaLabel={`Titel ${name}`} value={values.title} maxLength={200} onCommit={(title) => onCommit({ title })} />
      </div>
      <div className="field">
        <span>Kurzbeschreibung</span>
        <TextInput
          {...text} multiline ariaLabel={`Kurzbeschreibung ${name}`} value={values.description} maxLength={2000}
          onCommit={(description) => onCommit({ description })}
        />
      </div>
      <RangePicker label={`Zeitraum ${name}`} timePoints={book.timePoints} value={values.range} onChange={(range) => onCommit({ range })} />
      <CharacterChecks characters={book.characters} value={values.characterIds} onChange={(characterIds) => onCommit({ characterIds })} />
      <div className="field">
        <span>Notiz</span>
        <TextInput {...text} multiline ariaLabel={`Notiz ${name}`} value={values.note} maxLength={10000} onCommit={(note) => onCommit({ note })} />
      </div>
    </>
  );
}

/** Form values of a stored section. */
function draftOf(s: Section): SectionDraft {
  return { title: s.title, description: s.description, range: s.range, characterIds: s.characterIds, note: s.note ?? '' };
}

/** Request body for a (partial) section change. */
function toBody(d: Partial<SectionDraft>) {
  const body: Record<string, unknown> = { ...d };
  if (d.title !== undefined) body.title = d.title.trim();
  if (d.note !== undefined) body.note = noteOrNull(d.note);
  return body;
}

/** Section management for one main strand. */
export function SectionList({ book, storyline }: { book: Book; storyline: Storyline }) {
  const fb = useSaveFeedback();
  const [editingId, setEditingId] = useState<Id | null>(null);
  // Bumped after a successful add so the add form starts empty again; a failed add keeps the input.
  const [addKey, setAddKey] = useState(0);
  const base = `/api/books/${book.id}`;
  const ordered = [...storyline.sections].sort((a, b) => a.order - b.order);

  const create = useBookMutation<SectionDraft>(book.id, 'POST', () => `${base}/storylines/${storyline.id}/sections`, (d) => toBody(d));
  const update = useBookMutation<{ id: Id; patch: Partial<SectionDraft> }>(
    book.id, 'PATCH', (v) => `${base}/sections/${v.id}`, (v) => toBody(v.patch),
  );
  const remove = useBookMutation<{ id: Id }>(book.id, 'DELETE', (v) => `${base}/sections/${v.id}`);
  const reorder = useBookMutation<{ ids: Id[] }>(book.id, 'PUT', () => `${base}/storylines/${storyline.id}/sections/order`, (v) => v);

  /** Validates the section as changed against the whole book; returns true when it may be sent. */
  const check = (id: Id, draft: SectionDraft): boolean => {
    const existing = ordered.find((s) => s.id === id);
    const section: Section = {
      id, storylineId: storyline.id, title: draft.title.trim(), description: draft.description, characterIds: draft.characterIds,
      range: draft.range, note: noteOrNull(draft.note), order: existing?.order ?? ordered.length,
    };
    const sections = [...ordered.filter((s) => s.id !== id), section];
    const found = validateWithStoryline(book, { ...storyline, sections });
    if (found.length > 0) fb.reject(found);
    else fb.clear();
    return found.length === 0;
  };

  /** Direct save of one changed field of a stored section. */
  const saveField = (s: Section, patch: Partial<SectionDraft>) => {
    if (patch.title !== undefined && patch.title.trim() === '') {
      fb.reject([]);
      return;
    }
    if (check(s.id, { ...draftOf(s), ...patch })) update.mutate({ id: s.id, patch }, { onError: fb.onError });
  };

  const move = (i: number, delta: -1 | 1) => {
    const ids = ordered.map((s) => s.id);
    [ids[i], ids[i + delta]] = [ids[i + delta]!, ids[i]!];
    fb.clear();
    reorder.mutate({ ids }, { onError: fb.onError });
  };

  const confirmDelete = (s: Section) => {
    if (window.confirm(`Abschnitt „${s.title}“ löschen?`)) {
      fb.clear();
      remove.mutate({ id: s.id }, { onError: fb.onError });
    }
  };

  return (
    <section aria-label="Abschnitte">
      <h3>Abschnitte</h3>
      {fb.feedback}
      <ul className="panel-list">
        {ordered.map((s, i) => (
          <li key={s.id} className="section-item">
            {editingId === s.id ? (
              <div className="storyline-form">
                <SectionFields
                  book={book} name={s.title} values={draftOf(s)} live={false} resetKey={fb.resetKey}
                  onCommit={(patch) => saveField(s, patch)}
                />
                <div className="actions">
                  <button type="button" onClick={() => setEditingId(null)}>Fertig</button>
                </div>
              </div>
            ) : (
              <>
                <span>{s.title}</span>
                <button type="button" aria-label={`Abschnitt „${s.title}“ nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={`Abschnitt „${s.title}“ nach unten`} disabled={i === ordered.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" aria-label={`Abschnitt „${s.title}“ bearbeiten`} onClick={() => setEditingId(s.id)}>Bearbeiten</button>
                <button type="button" aria-label={`Abschnitt „${s.title}“ löschen`} onClick={() => confirmDelete(s)}>Löschen</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <AddSection
        key={addKey}
        book={book}
        initial={{ title: '', description: '', range: storyline.range, characterIds: [], note: '' }}
        resetKey={fb.resetKey}
        onSubmit={(draft) => {
          if (check('draft', draft)) create.mutate(draft, { onError: fb.onError, onSuccess: () => setAddKey((k) => k + 1) });
        }}
      />
    </section>
  );
}

/** The add-section form: local draft, one button. Remounted by the parent after a successful add. */
function AddSection({
  book, initial, resetKey, onSubmit,
}: { book: Book; initial: SectionDraft; resetKey: number; onSubmit: (draft: SectionDraft) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="storyline-form">
      <SectionFields
        book={book} name="neuer Abschnitt" values={draft} live resetKey={resetKey}
        onCommit={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      />
      <div className="actions">
        <button type="button" onClick={() => onSubmit(draft)}>Abschnitt hinzufügen</button>
      </div>
    </div>
  );
}
