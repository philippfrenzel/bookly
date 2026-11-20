/** Book page: header, storyline map slot and the side area with time point, character and storyline panels. */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { TimeRange } from '@bookly/shared';
import { useBook } from '../api/hooks';
import { ConnectionDialog, type ConnectionTarget } from '../connection/ConnectionDialog';
import { StorylineMap } from '../map/StorylineMap';
import { StorylinePanel, type PanelTarget } from '../storyline/StorylinePanel';
import { CharacterPanel } from './CharacterPanel';
import { SidePanel } from './SidePanel';
import { TimePointPanel } from './TimePointPanel';

/** Loads the book and lays out the page. */
export function BookPage() {
  const { bookId = '' } = useParams();
  const query = useBook(bookId);
  const book = query.data?.book;
  const [target, setTarget] = useState<PanelTarget>(null);
  const [tab, setTab] = useState('timepoints');
  const [connection, setConnection] = useState<ConnectionTarget | null>(null);
  const [nonce, setNonce] = useState(0);
  const selectedId = target?.mode === 'edit' ? target.id : null;

  /** Shows a storyline target in the storyline tab. */
  const open = (next: PanelTarget) => {
    setTarget(next);
    if (next) setTab('storyline');
  };
  const startCreate = (range?: TimeRange) => {
    setNonce((n) => n + 1);
    open({ mode: 'create', range, nonce: nonce + 1 });
  };

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
            <div className="map-toolbar">
              <button
                type="button"
                disabled={book.timePoints.length === 0}
                title={book.timePoints.length === 0 ? 'Lege zuerst Zeitpunkte an.' : undefined}
                onClick={() => startCreate()}
              >
                Neue Storyline
              </button>
            </div>
            <section aria-label="Storyline-Karte">
              <StorylineMap
                book={book}
                hints={query.data?.hints ?? []}
                selectedId={selectedId}
                onSelectStoryline={(id) => open({ mode: 'edit', id })}
                onCreateRange={(range) => startCreate(range)}
                onConnect={(fromId, toId) => setConnection({ mode: 'create', fromId, toId })}
                onSelectConnection={(id) => setConnection({ mode: 'edit', id })}
              />
            </section>
          </main>
          <SidePanel
            activeId={tab}
            onActiveChange={setTab}
            tabs={[
              { id: 'timepoints', label: 'Zeitpunkte', content: <TimePointPanel book={book} /> },
              { id: 'characters', label: 'Figuren', content: <CharacterPanel book={book} /> },
              { id: 'storyline', label: 'Storyline', content: <StorylinePanel book={book} target={target} onTarget={open} onConnect={(fromId, toId) => setConnection({ mode: 'create', fromId, toId })} /> },
            ]}
          />
          {connection && <ConnectionDialog book={book} target={connection} onClose={() => setConnection(null)} />}
        </div>
      )}
    </div>
  );
}
