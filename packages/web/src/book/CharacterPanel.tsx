/** Character management: add, edit profile fields, AI wand on each field, delete with confirmation. */
import { useRef, type FocusEvent } from 'react';
import type { Book, Character, Id } from '@bookly/shared';
import { characterLabel } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { MagicWand } from '../ai/MagicWand';
import { useSaveFeedback, type SaveFeedback } from './saveFeedback';
import { Icon } from '../ui/Icon';

type TextField = 'description' | 'behavior' | 'intentions';
type Field = TextField | 'name';
type Patch = { id: Id } & Partial<Record<TextField, string>> & { name?: string | null };

interface ItemProps {
  character: Character;
  bookId: Id;
  aiEnabled: boolean;
  fb: SaveFeedback;
  save: (patch: Patch) => void;
  onDelete: (c: Character) => void;
}

/** One character: four profile fields saved on blur, each with an AI wand, delete button. */
function CharacterItem({ character: c, bookId, aiEnabled, fb, save, onDelete }: ItemProps) {
  const label = characterLabel(c);
  const areas = useRef<Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>>({});

  /** Current (possibly unsaved) values of the four fields, as context for the AI. */
  const draft = () => ({
    name: areas.current.name?.value ?? c.name ?? '',
    description: areas.current.description?.value ?? c.description ?? '',
    behavior: areas.current.behavior?.value ?? c.behavior ?? '',
    intentions: areas.current.intentions?.value ?? c.intentions ?? '',
  });

  /** Saves a changed text field on blur. */
  const onBlurField = (field: TextField) => (e: FocusEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value === (c[field] ?? '')) return;
    save({ id: c.id, [field]: value });
  };

  const wand = (field: Field, fieldLabel: string) => (
    <MagicWand
      getField={() => areas.current[field] ?? null}
      bookId={bookId}
      target={{ kind: 'character', characterId: c.id, field }}
      draft={draft}
      enabled={aiEnabled}
      fieldLabel={fieldLabel}
    />
  );

  const textarea = (field: TextField, title: string) => {
    const ariaLabel = `${title} Figur ${label}`;
    return (
      <div className="wand-field">
        <textarea
          aria-label={ariaLabel}
          key={`${field}-${c[field] ?? ''}-${fb.resetKey}`}
          maxLength={2000}
          placeholder={title}
          ref={(el) => { areas.current[field] = el; }}
          defaultValue={c[field] ?? ''}
          onBlur={onBlurField(field)}
        />
        {wand(field, ariaLabel)}
      </div>
    );
  };

  const nameLabel = `Name Figur ${label}`;
  return (
    <li>
      <div className="wand-field">
        <input
          aria-label={nameLabel}
          key={`${c.name ?? ''}-${fb.resetKey}`}
          maxLength={200}
          placeholder="Unbenannte Figur"
          ref={(el) => { areas.current.name = el; }}
          defaultValue={c.name ?? ''}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name !== (c.name ?? '')) save({ id: c.id, name: name === '' ? null : name });
          }}
        />
        {wand('name', nameLabel)}
      </div>
      {textarea('description', 'Beschreibung')}
      {textarea('behavior', 'Verhalten')}
      {textarea('intentions', 'Absichten')}
      <button type="button" aria-label={`Figur „${label}“ löschen`} title="Löschen" className="icon-button" onClick={() => onDelete(c)}><Icon name="trash" /></button>
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
          <CharacterItem key={c.id} character={c} bookId={book.id} aiEnabled={aiEnabled} fb={fb} save={save} onDelete={confirmDelete} />
        ))}
      </ul>
    </section>
  );
}
