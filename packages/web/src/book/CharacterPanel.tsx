/** Character management: add, rename, describe, delete with confirmation. */
import type { Book, Character, Id } from '@bookly/shared';
import { useBookMutation } from '../api/hooks';

/** Panel for the book's characters. */
export function CharacterPanel({ book }: { book: Book }) {
  const base = `/api/books/${book.id}/characters`;
  const create = useBookMutation<void>(book.id, 'POST', () => base, () => ({ name: 'Neue Figur', description: '' }));
  const update = useBookMutation<{ id: Id; name: string; description: string }>(
    book.id, 'PATCH', (v) => `${base}/${v.id}`, (v) => ({ name: v.name, description: v.description }),
  );
  const remove = useBookMutation<{ id: Id }>(book.id, 'DELETE', (v) => `${base}/${v.id}`);

  const confirmDelete = (c: Character) => {
    if (window.confirm(`Figur „${c.name}“ aus allen Storylines entfernen?`)) remove.mutate({ id: c.id });
  };

  return (
    <section aria-label="Figuren">
      <button type="button" onClick={() => create.mutate()}>+ Figur</button>
      <ul className="panel-list">
        {book.characters.map((c) => (
          <li key={`${c.id}-${c.name}-${c.description ?? ''}`}>
            <input
              aria-label={`Name Figur ${c.name}`}
              defaultValue={c.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name === '') e.target.value = c.name;
                else if (name !== c.name) update.mutate({ id: c.id, name, description: c.description ?? '' });
              }}
            />
            <textarea
              aria-label={`Beschreibung Figur ${c.name}`}
              defaultValue={c.description ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (c.description ?? '')) update.mutate({ id: c.id, name: c.name, description: e.target.value });
              }}
            />
            <button type="button" aria-label={`Figur „${c.name}“ löschen`} onClick={() => confirmDelete(c)}>Löschen</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
