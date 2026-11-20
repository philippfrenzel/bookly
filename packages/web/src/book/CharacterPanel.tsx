/** Character management: add, edit profile fields, ask for AI suggestions, delete with confirmation. */
import { useRef, type FocusEvent } from 'react';
import type { Book, Character, Id } from '@bookly/shared';
import { characterLabel } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { SuggestionBox } from '../character/SuggestionBox';
import { useSuggestion } from '../character/useSuggestion';
import { useSaveFeedback, type SaveFeedback } from './saveFeedback';
import { Icon } from '../ui/Icon';

type TextField = 'description' | 'behavior' | 'intentions';
type Patch = { id: Id } & Partial<Record<TextField, string>> & { name?: string | null };

interface ItemProps {
  character: Character;
  base: string;
  aiEnabled: boolean;
  fb: SaveFeedback;
  save: (patch: Patch) => void;
  onDelete: (c: Character) => void;
}

/** One character: four profile fields saved on blur, suggestion button and box, delete button. */
function CharacterItem({ character: c, base, aiEnabled, fb, save, onDelete }: ItemProps) {
  const label = characterLabel(c);
  const { suggestion, loading, error, request, dismiss } = useSuggestion(`${base}/${c.id}/suggestion`);

  const areas = useRef<Partial<Record<TextField, HTMLTextAreaElement | null>>>({});

  const draft = (over: Partial<Record<TextField, string>> = {}) => ({
    name: c.name, description: c.description, behavior: c.behavior, intentions: c.intentions, ...over,
  });

  /** Saves a changed text field on blur; the description also asks the AI for a suggestion. */
  const onBlurField = (field: TextField) => (e: FocusEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value === (c[field] ?? '')) return;
    save({ id: c.id, [field]: value });
    if (field === 'description' && aiEnabled) request(draft({ description: value }));
  };

  const textarea = (field: TextField, title: string) => (
    <textarea
      aria-label={`${title} Figur ${label}`}
      key={`${field}-${c[field] ?? ''}-${fb.resetKey}`}
      maxLength={2000}
      placeholder={title}
      ref={(el) => { areas.current[field] = el; }}
      defaultValue={c[field] ?? ''}
      onBlur={onBlurField(field)}
    />
  );

  return (
    <li>
      <input
        aria-label={`Name Figur ${label}`}
        key={`${c.name ?? ''}-${fb.resetKey}`}
        maxLength={200}
        placeholder="Unbenannte Figur"
        defaultValue={c.name ?? ''}
        onBlur={(e) => {
          const name = e.target.value.trim();
          if (name !== (c.name ?? '')) save({ id: c.id, name: name === '' ? null : name });
        }}
      />
      {textarea('description', 'Beschreibung')}
      {textarea('behavior', 'Verhalten')}
      {textarea('intentions', 'Absichten')}
      <button
        type="button"
        disabled={!aiEnabled || loading}
        title={aiEnabled ? undefined : 'KI nicht eingerichtet'}
        onClick={() => request(draft())}
      >
        Vorschlagen
      </button>
      <button type="button" aria-label={`Figur „${label}“ löschen`} title="Löschen" className="icon-button" onClick={() => onDelete(c)}><Icon name="trash" /></button>
      {error && <p className="muted" role="alert">{error}</p>}
      {suggestion && (
        <SuggestionBox
          suggestion={suggestion}
          fields={{
            behavior: () => areas.current.behavior?.value ?? c.behavior ?? '',
            intentions: () => areas.current.intentions?.value ?? c.intentions ?? '',
          }}
          onApply={(field, value) => save({ id: c.id, [field]: value })}
          onDismiss={dismiss}
        />
      )}
    </li>
  );
}

/** Panel for the book's characters. */
export function CharacterPanel({ book, aiEnabled }: { book: Book; aiEnabled: boolean }) {
  // Its resetKey is bumped on a failed save so inputs fall back to the stored values.
  const fb = useSaveFeedback();
  const base = `/api/books/${book.id}/characters`;
  const create = useBookMutation<void>(book.id, 'POST', () => base, () => ({ name: 'Neue Figur', description: '' }));
  // Only the changed field is sent.
  const update = useBookMutation<Patch>(book.id, 'PATCH', (v) => `${base}/${v.id}`, ({ id: _id, ...fields }) => fields);
  const remove = useBookMutation<{ id: Id }>(book.id, 'DELETE', (v) => `${base}/${v.id}`);

  const onError = fb.onError;
  const save = (v: Patch) => {
    fb.clear();
    update.mutate(v, { onError });
  };

  const confirmDelete = (c: Character) => {
    if (window.confirm(`Figur „${characterLabel(c)}“ aus allen Storylines entfernen?`)) remove.mutate({ id: c.id }, { onError });
  };

  return (
    <section aria-label="Figuren">
      <button type="button" className="with-icon" onClick={() => create.mutate(undefined, { onError })}><Icon name="plus" />Figur</button>
      {fb.feedback}
      <ul className="panel-list">
        {book.characters.map((c) => (
          <CharacterItem key={c.id} character={c} base={base} aiEnabled={aiEnabled} fb={fb} save={save} onDelete={confirmDelete} />
        ))}
      </ul>
    </section>
  );
}
