/** Book list page: shows the user's books and creates new ones. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBooks, useCreateBook, useLogout, useMe } from '../api/hooks';

/** Landing page after sign-in. */
export function BookListPage() {
  const navigate = useNavigate();
  const me = useMe();
  const books = useBooks();
  const create = useCreateBook();
  const logout = useLogout();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

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

      {books.isPending && <p className="muted">Laden …</p>}
      {books.isError && <p className="error">Bücher konnten nicht geladen werden.</p>}
      {books.data && books.data.length === 0 && <p className="muted">Noch keine Bücher. Lege dein erstes an.</p>}
      <ul className="book-list">
        {books.data?.map((b) => (
          <li key={b.id}>
            <Link to={`/books/${b.id}`}>{b.title}</Link>
            <span className="muted">
              {b.storylineCount} {b.storylineCount === 1 ? 'Handlungsstrang' : 'Handlungsstränge'}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
