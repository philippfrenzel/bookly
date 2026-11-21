/**
 * Book page: header, storyline map with the selected storyline's timetable below it, and the side area with
 * time point, character, scene and storyline panels. A selected storyline fills the side area (with a way back to the book).
 */
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
import { ScenePanel } from '../scene/ScenePanel';
import { StorylinePanel, type PanelTarget, type SectionFocus } from '../storyline/StorylinePanel';
import type { StorylineTab } from '../storyline/StorylineHeader';
import { Timetable } from '../storyline/Timetable';
import { Icon } from '../ui/Icon';
import { MentionNamesProvider } from '../editor/MentionNames';
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
  const [tab, setTabState] = useState('timepoints');
  // The book tab to return to when leaving a storyline.
  const [bookTab, setBookTab] = useState('timepoints');
  const [storylineTab, setStorylineTab] = useState<StorylineTab>('details');
  const [focusSection, setFocusSection] = useState<SectionFocus | null>(null);
  const [connection, setConnection] = useState<ConnectionTarget | null>(null);
  const [hintConnectionId, setHintConnectionId] = useState<Id | null>(null);
  const [nonce, setNonce] = useState(0);
  const selectedId = target?.mode === 'edit' ? target.id : null;

  const setTab = (id: string) => {
    setTabState(id);
    if (id !== 'storyline') setBookTab(id);
  };
  /** Shows a storyline target in the storyline tab. */
  const open = (next: PanelTarget) => {
    setTarget(next);
    setFocusSection(null);
    if (next) setTabState('storyline');
  };
  /** Leaves the storyline and returns to the book tab used before. */
  const back = () => {
    setTarget(null);
    setFocusSection(null);
    setTabState(bookTab);
  };
  /** Opens one group (and optionally a section) of the selected storyline from the timetable. */
  const showInPanel = (group: StorylineTab, sectionId?: Id | null) => {
    setTabState('storyline');
    setStorylineTab(group);
    setFocusSection(sectionId === undefined ? null : { id: sectionId, nonce: Date.now() });
  };
  /** Opens a section of a storyline from elsewhere (e.g. the scene list): storyline mode, „Zeitpunkte“ tab, section in edit. */
  const openSection = (storylineId: Id, sectionId: Id) => {
    open({ mode: 'edit', id: storylineId });
    showInPanel('timeline', sectionId);
  };
  /** Opens a storyline on its „Szenen“ tab (e.g. from the scene list). */
  const openStorylineScenes = (storylineId: Id) => {
    open({ mode: 'edit', id: storylineId });
    showInPanel('scenes');
  };
  const selected = selectedId ? book?.storylines.find((s) => s.id === selectedId) : undefined;
  const storylineMode = tab === 'storyline' && target !== null;
  const startCreate = (range?: TimeRange) => {
    setNonce((n) => n + 1);
    open({ mode: 'create', range, nonce: nonce + 1 });
  };

  return (
    <MentionNamesProvider names={book?.characters.flatMap((c) => (c.name ? [c.name] : [])) ?? []}>
    <div className="book-page">
      <header className="app-header">
        <Link to="/" className="wordmark">Bookly</Link>
        <nav className="crumbs" aria-label="Pfad">
          <Link to="/">Meine Bücher</Link>
          {book && <span aria-hidden="true">/</span>}
        </nav>
        {book && <h1>{book.title}</h1>}
        {book && (
          <Link to={`/books/${book.id}/manuskript`} className="header-link with-icon">
            <Icon name="book" />
            Manuskript
          </Link>
        )}
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
            {selected ? (
              <Timetable
                book={book}
                storyline={selected}
                warnings={query.data?.characterWarnings ?? []}
                scenes={query.data?.scenes ?? []}
                sceneAssignments={query.data?.sceneAssignments ?? []}
                onOpenSection={(id) => showInPanel('timeline', id)}
                onOpenCharacters={() => showInPanel('characters')}
                onOpenConnection={(id) => setConnection({ mode: 'edit', id })}
              />
            ) : (
              <p className="timetable-placeholder muted">
                Wähle eine Linie in der Karte, dann siehst du hier ihren Fahrplan: Abschnitte, Figuren und Verbindungen über die Zeitpunkte.
              </p>
            )}
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
            bar={storylineMode ? (
              <button type="button" className="panel-back" onClick={back}>
                <Icon name="back" />
                Zurück zum Buch
              </button>
            ) : undefined}
            tabs={[
              { id: 'timepoints', label: 'Zeitpunkte', content: <TimePointPanel book={book} /> },
              { id: 'characters', label: 'Figuren', content: <CharacterPanel book={book} aiEnabled={query.data?.ai.enabled ?? false} /> },
              { id: 'scenes', label: 'Szenen', content: <ScenePanel book={book} scenes={query.data?.scenes ?? []} assignments={query.data?.sceneAssignments ?? []} aiEnabled={query.data?.ai.enabled ?? false} onOpenSection={openSection} onOpenStoryline={openStorylineScenes} /> },
              { id: 'storyline', label: 'Storyline', content: <StorylinePanel book={book} checks={query.data?.characterChecks ?? []} aiEnabled={query.data?.ai.enabled ?? false} target={target} onTarget={open} onConnect={(fromId, toId) => setConnection({ mode: 'create', fromId, toId })} tab={storylineTab} onTab={(t) => { setStorylineTab(t); setFocusSection(null); }} focusSection={focusSection} onOpenConnection={(id) => setConnection({ mode: 'edit', id })} /> },
            ]}
          />
          {connection && <ConnectionDialog book={book} target={connection} aiEnabled={query.data?.ai.enabled ?? false} onClose={() => setConnection(null)} />}
        </div>
      )}
    </div>
    </MentionNamesProvider>
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
