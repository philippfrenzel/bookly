/** Character management: add, rename, describe, delete with confirmation. */
import type { Book, Character, Id } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';
import { useSaveFeedback } from './saveFeedback';
import { Icon } from '../ui/Icon';

/** Panel for the book's characters. */
export function CharacterPanel({ book }: { book: Book }) {
  // Its resetKey is bumped on a failed save so inputs fall back to the stored values.
  const fb = useSaveFeedback();
  const base = `/api/books/${book.id}/characters`;
  const create = useBookMutation<void>(book.id, 'POST', () => base, () => ({ name: 'Neue Figur', description: '' }));
  const update = useBookMutation<{ id: Id; name: string; description: string }>(
    book.id, 'PATCH', (v) => `${base}/${v.id}`, (v) => ({ name: v.name, description: v.description }),
  );
  const remove = useBookMutation<{ id: Id }>(book.id, 'DELETE', (v) => `${base}/${v.id}`);

  const onError = fb.onError;
  const save = (v: { id: Id; name: string; description: string }) => {
    fb.clear();
    update.mutate(v, { onError });
  };

  const confirmDelete = (c: Character) => {
    if (window.confirm(`Figur „${c.name}“ aus allen Storylines entfernen?`)) remove.mutate({ id: c.id }, { onError });
  };

  return (
    <section aria-label="Figuren">
      <button type="button" onClick={() => create.mutate(undefined, { onError })}>+ Figur</button>
      {fb.feedback}
      <ul className="panel-list">
        {book.characters.map((c) => (
          <li key={c.id}>
            <input
              aria-label={`Name Figur ${c.name}`}
              key={`${c.name}-${fb.resetKey}`}
              maxLength={200}
              defaultValue={c.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name === '') e.target.value = c.name;
                else if (name !== c.name) save({ id: c.id, name, description: c.description ?? '' });
              }}
            />
            <textarea
              aria-label={`Beschreibung Figur ${c.name}`}
              key={`${c.description ?? ''}-${fb.resetKey}`}
              maxLength={2000}
              defaultValue={c.description ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (c.description ?? '')) save({ id: c.id, name: c.name, description: e.target.value });
              }}
            />
            <button type="button" aria-label={`Figur „${c.name}“ löschen`} title="Löschen" className="icon-button" onClick={() => confirmDelete(c)}><Icon name="trash" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
