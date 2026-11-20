/** Book page: header, storyline map slot and the side area with time point, character and storyline panels. */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Book, Id, TimeRange } from '@bookly/shared';
import { ApiError } from '../api/client';
import { useBook } from '../api/hooks';
import { ConnectionDialog, type ConnectionTarget } from '../connection/ConnectionDialog';
import { FilterBar } from '../map/FilterBar';
import { LineLegend } from '../map/LineLegend';
import { applyFilters, toMapFilter, useStoredFilters } from '../map/filters';
import { StorylineMap, type StorylineMapProps } from '../map/StorylineMap';
import { StorylinePanel, type PanelTarget } from '../storyline/StorylinePanel';
import { BookHints } from './BookHints';
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
  const [hintConnectionId, setHintConnectionId] = useState<Id | null>(null);
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
      <header className="app-header">
        <Link to="/" className="wordmark">Bookly</Link>
        <nav className="crumbs" aria-label="Pfad">
          <Link to="/">Meine Bücher</Link>
          {book && <span aria-hidden="true">/</span>}
        </nav>
        {book && <h1>{book.title}</h1>}
        {book && (
          <button
            type="button"
            className="primary header-action"
            disabled={book.timePoints.length === 0}
            title={book.timePoints.length === 0 ? 'Lege zuerst Zeitpunkte an.' : undefined}
            onClick={() => startCreate()}
          >
            Neue Storyline
          </button>
        )}
      </header>
      {query.isPending && <p className="muted page-status">Laden …</p>}
      {query.isError && (
        <p className="error page-status" role="alert">
          {query.error instanceof ApiError && query.error.status === 404
            ? 'Buch nicht gefunden.'
            : 'Das Buch konnte nicht geladen werden.'}
        </p>
      )}
      {book && (
        <div className="book-layout">
          <main>
            <section aria-label="Storyline-Karte">
              <FilteredMap
                key={book.id}
                book={book}
                hints={query.data?.hints ?? []}
                selectedId={selectedId}
                onSelectStoryline={(id) => open({ mode: 'edit', id })}
                onCreateRange={(range) => startCreate(range)}
                onConnect={(fromId, toId) => setConnection({ mode: 'create', fromId, toId })}
                onSelectConnection={(id) => setConnection({ mode: 'edit', id })}
                highlightConnectionId={hintConnectionId}
              />
            </section>
          </main>
          <SidePanel
            top={
              <BookHints
                book={book}
                hints={query.data?.hints ?? []}
                warnings={query.data?.characterWarnings ?? []}
                aiEnabled={query.data?.ai.enabled ?? false}
                onShowStoryline={(id) => open({ mode: 'edit', id })}
                onShow={(id) => {
                  setHintConnectionId(null);
                  setConnection({ mode: 'edit', id });
                }}
                onHighlight={setHintConnectionId}
              />
            }
            activeId={tab}
            onActiveChange={setTab}
            tabs={[
              { id: 'timepoints', label: 'Zeitpunkte', content: <TimePointPanel book={book} /> },
              { id: 'characters', label: 'Figuren', content: <CharacterPanel book={book} aiEnabled={query.data?.ai.enabled ?? false} /> },
              { id: 'storyline', label: 'Storyline', content: <StorylinePanel book={book} checks={query.data?.characterChecks ?? []} aiEnabled={query.data?.ai.enabled ?? false} target={target} onTarget={open} onConnect={(fromId, toId) => setConnection({ mode: 'create', fromId, toId })} /> },
            ]}
          />
          {connection && <ConnectionDialog book={book} target={connection} onClose={() => setConnection(null)} />}
        </div>
      )}
    </div>
  );
}

/** Filter bar plus map; filter state is remembered per book in localStorage. */
function FilteredMap(props: Omit<StorylineMapProps, 'filter' | 'showNotes' | 'highlightId'> & { book: Book }) {
  const { book } = props;
  const [state, setState] = useStoredFilters(book.id, book);
  const filter = useMemo(() => toMapFilter(state, book.timePoints), [state, book.timePoints]);
  const visibleIds = useMemo(() => applyFilters(book, filter), [book, filter]);
  const [highlightId, setHighlightId] = useState<Id | null>(null);
  return (
    <>
      <div className="map-bar">
        <LineLegend book={book} visibleIds={visibleIds} selectedId={props.selectedId} onSelect={props.onSelectStoryline} onHighlight={setHighlightId} />
        <FilterBar book={book} state={state} onChange={setState} visibleCount={visibleIds.size} />
      </div>
      <StorylineMap {...props} filter={filter} showNotes={state.showNotes} highlightId={highlightId} />
    </>
  );
}
