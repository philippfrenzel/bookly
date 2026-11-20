/** Book page: header, storyline map slot and the side area with time point and character panels. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBook } from '../api/hooks';
import { StorylineMap } from '../map/StorylineMap';
import { CharacterPanel } from './CharacterPanel';
import { SidePanel } from './SidePanel';
import { TimePointPanel } from './TimePointPanel';

/** Loads the book and lays out the page. */
export function BookPage() {
  const { bookId = '' } = useParams();
  const query = useBook(bookId);
  const book = query.data?.book;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="book-page">
      <header className="page-header">
        <Link to="/">← Meine Bücher</Link>
        {book && <h1>{book.title}</h1>}
      </header>
      {query.isPending && <p className="muted">Laden …</p>}
      {query.isError && <p className="error">Buch nicht gefunden.</p>}
      {book && (
        <div className="book-layout">
          <main>
            <section aria-label="Storyline-Karte">
              <StorylineMap
                book={book}
                hints={query.data?.hints ?? []}
                selectedId={selectedId}
                onSelectStoryline={setSelectedId}
              />
            </section>
          </main>
          <SidePanel
            tabs={[
              { id: 'timepoints', label: 'Zeitpunkte', content: <TimePointPanel book={book} /> },
              { id: 'characters', label: 'Figuren', content: <CharacterPanel book={book} /> },
            ]}
          />
        </div>
      )}
    </div>
  );
}
