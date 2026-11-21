/** Book list page: greets the author, offers the last edited book and shows all books as cards; creates, renames and deletes them. */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BookSummary } from '@bookly/shared';
import { useBooks, useCreateBook, useDeleteBook, useLogout, useMe, useRenameBook } from '../api/hooks';
import { useSaveFeedback } from '../book/saveFeedback';
import { Icon } from '../ui/Icon';
import { BookCard, ContinueCard } from './BookCard';

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

  const list = books.data ?? [];
  const latest = mostRecent(list);
  const name = me.data?.displayName;
  const storylines = list.reduce((n, b) => n + b.storylineCount, 0);

  return (
    <>
      <header className="app-header">
        <span className="wordmark">Bookly</span>
        <span className="header-spacer" />
        {name && (
          <span className="user-chip">
            <span className="avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
            <span className="user-name">{name}</span>
          </span>
        )}
        <button type="button" className="header-quiet" onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}>
          Abmelden
        </button>
      </header>
      <main className="page">
        <div className="page-title">
          <div className="greeting">
            <h1>Meine Bücher</h1>
            <p className="greeting-line">
              {name ? `Hallo ${name}, schön, dass du da bist.` : 'Schön, dass du da bist.'}
              {list.length > 0 && ` ${summaryLine(list.length, storylines)}`}
            </p>
          </div>
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
              <Icon name="plus" />
              Neues Buch
            </button>
          )}
        </div>
        {create.isError && (
          <p className="error" role="alert">
            Das Buch konnte nicht angelegt werden.
          </p>
        )}

        {fb.feedback}
        {books.isPending && <p className="muted">Laden …</p>}
        {books.isError && <p className="error">Bücher konnten nicht geladen werden.</p>}
        {books.data && list.length === 0 && (
          <div className="empty-shelf">
            <p className="empty-shelf-title">Noch keine Bücher.</p>
            <p className="muted">Lege dein erstes an und zieh die erste Linie deiner Geschichte.</p>
          </div>
        )}
        {latest && list.length > 1 && <ContinueCard book={latest} />}
        {list.length > 0 && (
          <section className="shelf" aria-labelledby="shelf-title">
            <h2 id="shelf-title" className="section-title">Alle Bücher</h2>
            <ul className="book-grid">
              {list.map((b) => (
                <BookCard
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
              {!adding && (
                <li>
                  <button type="button" className="new-book-card" onClick={() => setAdding(true)}>
                    <span className="new-book-plus" aria-hidden="true">
                      <Icon name="plus" />
                    </span>
                    <span className="new-book-title">Neue Linie ziehen</span>
                    <span className="muted">Ein neues Buch beginnen</span>
                  </button>
                </li>
              )}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

/** The book changed most recently, or undefined for an empty list. */
function mostRecent(list: BookSummary[]): BookSummary | undefined {
  return list.reduce<BookSummary | undefined>((best, b) => (!best || b.updatedAt > best.updatedAt ? b : best), undefined);
}

/** „2 Bücher und 7 Handlungsstränge warten auf dich.“ */
function summaryLine(books: number, storylines: number): string {
  const b = books === 1 ? '1 Buch' : `${books} Bücher`;
  if (storylines === 0) return `${b} ${books === 1 ? 'wartet' : 'warten'} auf dich.`;
  const s = storylines === 1 ? '1 Handlungsstrang' : `${storylines} Handlungsstränge`;
  return `${b} und ${s} warten auf dich.`;
}
