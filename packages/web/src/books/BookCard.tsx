/** Book list cards: one book with its line preview, and the "continue where you left off" feature card. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BookSummary } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { LinePreview, tintStyle } from './LinePreview';
import { countLabel, editedAgo } from './relativeTime';

/** „3 Handlungsstränge · 7 Figuren“. */
export function bookFacts(book: BookSummary): string {
  return `${countLabel(book.storylineCount, 'Handlungsstrang', 'Handlungsstränge')} · ${countLabel(book.characterCount, 'Figur', 'Figuren')}`;
}

interface CardProps {
  book: BookSummary;
  resetKey: number;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

/** One card: opens the book; inline rename (saves on blur, Enter confirms, Escape cancels) and delete with confirmation. */
export function BookCard({ book, resetKey, onRename, onDelete }: CardProps) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="book-card">
      <div className="book-card-preview" style={tintStyle(book.lines)}>
        <LinePreview lines={book.lines} />
      </div>
      <div className="book-card-body">
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
          <Link className="book-card-link" to={`/books/${book.id}`}>
            {book.title}
          </Link>
        )}
        <span className="book-card-facts">{bookFacts(book)}</span>
        <span className="book-card-when">Bearbeitet {editedAgo(book.updatedAt)}</span>
      </div>
      <div className="book-card-actions">
        <button type="button" className="icon-button" aria-label={`Buch „${book.title}“ umbenennen`} title="Umbenennen" onClick={() => setEditing(true)}>
          <Icon name="pencil" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Buch „${book.title}“ löschen`}
          title="Löschen"
          onClick={() => {
            if (window.confirm(`Buch „${book.title}“ löschen? Alle Storylines dieses Buchs werden entfernt.`)) onDelete(book.id);
          }}
        >
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}

/** Large card for the most recently edited book. */
export function ContinueCard({ book }: { book: BookSummary }) {
  return (
    <section className="continue-card" aria-labelledby="continue-title">
      <div className="continue-preview" style={tintStyle(book.lines)}>
        <LinePreview lines={book.lines} height={170} />
      </div>
      <div className="continue-body">
        <p className="continue-when">
          <span className="continue-dot" aria-hidden="true" />
          Zuletzt bearbeitet · {editedAgo(book.updatedAt)}
        </p>
        <h2 id="continue-title">{book.title}</h2>
        <p className="muted">{bookFacts(book)}</p>
        <Link className="button-link primary" to={`/books/${book.id}`} aria-label={`Weitermachen mit „${book.title}“`}>
          Weitermachen
          <Icon name="arrow" />
        </Link>
      </div>
    </section>
  );
}
