/** Character management: add, rename, describe, delete with confirmation. */
import { useState } from 'react';
import type { Book, Character, Id, ValidationIssue } from '@bookly/shared';
import type { ApiError } from '../api/client';
import { useBookMutation } from '../api/hooks';
import { IssueList } from './IssueList';

/** Panel for the book's characters. */
export function CharacterPanel({ book }: { book: Book }) {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  // Bumped on a failed save so inputs fall back to the stored values.
  const [resetKey, setResetKey] = useState(0);
  const base = `/api/books/${book.id}/characters`;
  const create = useBookMutation<void>(book.id, 'POST', () => base, () => ({ name: 'Neue Figur', description: '' }));
  const update = useBookMutation<{ id: Id; name: string; description: string }>(
    book.id, 'PATCH', (v) => `${base}/${v.id}`, (v) => ({ name: v.name, description: v.description }),
  );
  const remove = useBookMutation<{ id: Id }>(book.id, 'DELETE', (v) => `${base}/${v.id}`);

  const onError = (e: ApiError) => {
    const body = e.body as { issues?: ValidationIssue[] } | undefined;
    if (e.status === 422 && body?.issues) setIssues(body.issues);
    setResetKey((k) => k + 1);
  };
  const save = (v: { id: Id; name: string; description: string }) => {
    setIssues([]);
    update.mutate(v, { onError });
  };

  const confirmDelete = (c: Character) => {
    if (window.confirm(`Figur „${c.name}“ aus allen Storylines entfernen?`)) remove.mutate({ id: c.id }, { onError });
  };

  return (
    <section aria-label="Figuren">
      <button type="button" onClick={() => create.mutate(undefined, { onError })}>+ Figur</button>
      <IssueList issues={issues} />
      <ul className="panel-list">
        {book.characters.map((c) => (
          <li key={c.id}>
            <input
              aria-label={`Name Figur ${c.name}`}
              key={`${c.name}-${resetKey}`}
              defaultValue={c.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name === '') e.target.value = c.name;
                else if (name !== c.name) save({ id: c.id, name, description: c.description ?? '' });
              }}
            />
            <textarea
              aria-label={`Beschreibung Figur ${c.name}`}
              key={`${c.description ?? ''}-${resetKey}`}
              defaultValue={c.description ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (c.description ?? '')) save({ id: c.id, name: c.name, description: e.target.value });
              }}
            />
            <button type="button" aria-label={`Figur „${c.name}“ löschen`} onClick={() => confirmDelete(c)}>Löschen</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
