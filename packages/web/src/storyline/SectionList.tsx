/** Sections of a main strand: ordered list with reorder, add, inline edit and delete. */
import { useState } from 'react';
import type { Book, Id, Section, Storyline, TimeRange, ValidationIssue } from '@bookly/shared';
import type { ApiError } from '../api/client';
import { useBookMutation } from '../api/hooks';
import { IssueList } from '../book/IssueList';
import { CharacterChecks } from './CharacterChecks';
import { noteOrNull, validateWithStoryline } from './draft';
import { RangePicker } from './RangePicker';

/** Editable fields of a section. */
interface SectionDraft {
  title: string;
  description: string;
  range: TimeRange;
  characterIds: Id[];
  note: string;
}

interface FormProps {
  book: Book;
  /** Used in accessible names, e.g. „neuer Abschnitt“ or the section title. */
  name: string;
  initial: SectionDraft;
  submitLabel: string;
  onSubmit: (draft: SectionDraft) => void;
  onCancel?: () => void;
}

/** Form for the section fields; the draft is local until submitted. */
function SectionForm({ book, name, initial, submitLabel, onSubmit, onCancel }: FormProps) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<SectionDraft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <div className="storyline-form">
      <div className="field">
        <span>Titel</span>
        <input aria-label={`Titel ${name}`} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="field">
        <span>Kurzbeschreibung</span>
        <textarea aria-label={`Kurzbeschreibung ${name}`} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      </div>
      <RangePicker label={`Zeitraum ${name}`} timePoints={book.timePoints} value={draft.range} onChange={(range) => set({ range })} />
      <CharacterChecks characters={book.characters} value={draft.characterIds} onChange={(characterIds) => set({ characterIds })} />
      <div className="field">
        <span>Notiz</span>
        <textarea aria-label={`Notiz ${name}`} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
      </div>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            onSubmit(draft);
            if (!onCancel) setDraft(initial);
          }}
        >
          {submitLabel}
        </button>
        {onCancel && <button type="button" onClick={onCancel}>Abbrechen</button>}
      </div>
    </div>
  );
}

/** Section management for one main strand. */
export function SectionList({ book, storyline }: { book: Book; storyline: Storyline }) {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [editingId, setEditingId] = useState<Id | null>(null);
  // Bumped after a successful add so the add form starts empty again.
  const [addKey, setAddKey] = useState(0);
  const base = `/api/books/${book.id}`;
  const ordered = [...storyline.sections].sort((a, b) => a.order - b.order);

  const create = useBookMutation<SectionDraft>(book.id, 'POST', () => `${base}/storylines/${storyline.id}/sections`, toBody);
  const update = useBookMutation<{ id: Id; draft: SectionDraft }>(
    book.id, 'PATCH', (v) => `${base}/sections/${v.id}`, (v) => toBody(v.draft),
  );
  const remove = useBookMutation<{ id: Id }>(book.id, 'DELETE', (v) => `${base}/sections/${v.id}`);
  const reorder = useBookMutation<{ ids: Id[] }>(book.id, 'PUT', () => `${base}/storylines/${storyline.id}/sections/order`, (v) => v);

  const onError = (e: ApiError) => {
    const body = e.body as { issues?: ValidationIssue[] } | undefined;
    if (e.status === 422 && body?.issues) setIssues(body.issues);
  };

  /** Validates the draft locally; returns true when it may be sent. */
  const check = (id: Id, draft: SectionDraft): boolean => {
    const section: Section = {
      id, storylineId: storyline.id, title: draft.title.trim(), description: draft.description, characterIds: draft.characterIds,
      range: draft.range, note: noteOrNull(draft.note), order: ordered.length,
    };
    const sections = [...ordered.filter((s) => s.id !== id), section];
    const found = validateWithStoryline(book, { ...storyline, sections });
    setIssues(found);
    return found.length === 0;
  };

  const move = (i: number, delta: -1 | 1) => {
    const ids = ordered.map((s) => s.id);
    [ids[i], ids[i + delta]] = [ids[i + delta]!, ids[i]!];
    setIssues([]);
    reorder.mutate({ ids }, { onError });
  };

  const confirmDelete = (s: Section) => {
    if (window.confirm(`Abschnitt „${s.title}“ löschen?`)) {
      setIssues([]);
      remove.mutate({ id: s.id }, { onError });
    }
  };

  return (
    <section aria-label="Abschnitte">
      <h3>Abschnitte</h3>
      <IssueList issues={issues} />
      <ul className="panel-list">
        {ordered.map((s, i) => (
          <li key={s.id} className="section-item">
            {editingId === s.id ? (
              <SectionForm
                book={book}
                name={s.title}
                initial={{ title: s.title, description: s.description, range: s.range, characterIds: s.characterIds, note: s.note ?? '' }}
                submitLabel="Abschnitt speichern"
                onCancel={() => setEditingId(null)}
                onSubmit={(draft) => {
                  if (check(s.id, draft)) update.mutate({ id: s.id, draft }, { onError, onSuccess: () => setEditingId(null) });
                }}
              />
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
      <SectionForm
        key={addKey}
        book={book}
        name="neuer Abschnitt"
        initial={{ title: '', description: '', range: storyline.range, characterIds: [], note: '' }}
        submitLabel="Abschnitt hinzufügen"
        onSubmit={(draft) => {
          if (check('draft', draft)) create.mutate(draft, { onError, onSuccess: () => setAddKey((k) => k + 1) });
        }}
      />
    </section>
  );
}

/** Request body for creating or patching a section. */
function toBody(d: SectionDraft) {
  return {
    title: d.title.trim(),
    description: d.description,
    characterIds: d.characterIds,
    range: d.range,
    note: noteOrNull(d.note),
  };
}
