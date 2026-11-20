/** Book list page: shows the user's books; creates, renames (inline) and deletes them. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { BookSummary } from '@bookly/shared';
import { useBooks, useCreateBook, useDeleteBook, useLogout, useMe, useRenameBook } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';

/** Landing page after sign-in. */
export function BookListPage() {
  const navigate = useNavigate();
  const me = useMe();
  const books = useBooks();
  const create = useCreateBook();
  const logout = useLogout();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const rename = useRenameBook();
  const remove = useDeleteBook();
  const fb = useSaveFeedback();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate(
      { title: trimmed },
      {
        onSuccess: () => {
          setTitle('');
          setAdding(false);
        },
      },
    );
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Meine Bücher</h1>
        <span className="muted">{me.data?.displayName}</span>
        <button type="button" onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}>
          Abmelden
        </button>
      </header>

      {adding ? (
        <form className="inline-form" onSubmit={submit}>
          <label>
            Titel
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200} />
          </label>
          <button type="submit" className="primary" disabled={create.isPending}>
            Anlegen
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            Abbrechen
          </button>
        </form>
      ) : (
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Neues Buch
        </button>
      )}
      {create.isError && (
        <p className="error" role="alert">
          Das Buch konnte nicht angelegt werden.
        </p>
      )}

      {fb.feedback}
      {books.isPending && <p className="muted">Laden …</p>}
      {books.isError && <p className="error">Bücher konnten nicht geladen werden.</p>}
      {books.data && books.data.length === 0 && <p className="muted">Noch keine Bücher. Lege dein erstes an.</p>}
      <ul className="book-list">
        {books.data?.map((b) => (
          <BookRow
            key={b.id}
            book={b}
            resetKey={fb.resetKey}
            onRename={(id, next) => {
              fb.clear();
              rename.mutate({ id, title: next }, { onError: fb.onError });
            }}
            onDelete={(id) => {
              fb.clear();
              remove.mutate({ id }, { onError: fb.onError });
            }}
          />
        ))}
      </ul>
    </main>
  );
}

interface RowProps {
  book: BookSummary;
  resetKey: number;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/** One list entry: link, inline rename (saves on blur, Enter confirms, Escape cancels) and delete with confirmation. */
function BookRow({ book, resetKey, onRename, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false);
  return (
    <li>
      {editing ? (
        <input
          aria-label={`Titel Buch ${book.title}`}
          defaultValue={book.title}
          key={resetKey}
          maxLength={200}
          autoFocus
          onBlur={(e) => {
            const next = e.target.value.trim();
            setEditing(false);
            if (next !== '' && next !== book.title) onRename(book.id, next);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.currentTarget.value = book.title;
              e.currentTarget.blur();
            }
          }}
        />
      ) : (
        <Link to={`/books/${book.id}`}>{book.title}</Link>
      )}
      <span className="muted">
        {book.storylineCount} {book.storylineCount === 1 ? 'Handlungsstrang' : 'Handlungsstränge'}
      </span>
      <button type="button" aria-label={`Buch „${book.title}“ umbenennen`} onClick={() => setEditing(true)}>
        Umbenennen
      </button>
      <button
        type="button"
        aria-label={`Buch „${book.title}“ löschen`}
        onClick={() => {
          if (window.confirm(`Buch „${book.title}“ löschen? Alle Storylines dieses Buchs werden entfernt.`)) onDelete(book.id);
        }}
      >
        Löschen
      </button>
    </li>
  );
}
