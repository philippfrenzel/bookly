/**
 * Manuscript page: the chapters of the book with their Bausteine in the middle, and a side panel with the AI structure
 * proposal (author), the trash and the reviewers (author). Reviewers reach it from their book list.
 */
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MANUSCRIPT_LIMITS } from '@bookly/shared';
import { ApiError } from '../api/client';
import { SidePanel, type SideTab } from '../book/SidePanel';
import { Icon } from '../ui/Icon';
import { ChapterSection } from './ChapterSection';
import { manuscriptError, useManuscript, useManuscriptMutation } from './manuscriptApi';
import { ProposalPanel } from './ProposalPanel';
import { ReviewerPanel } from './ReviewerPanel';
import { LengthPanel } from './LengthPanel';
import { StylePanel } from './StylePanel';
import { TrashPanel } from './TrashPanel';

/** Loads the manuscript and lays out the page. */
export function ManuscriptPage() {
  const { bookId = '' } = useParams();
  const query = useManuscript(bookId);
  const ms = query.data;
  const mutate = useManuscriptMutation(bookId);
  const [tab, setTab] = useState('ai');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const author = ms?.role === 'author';

  const addChapter = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) mutate.mutate({ method: 'POST', path: '/chapters', body: { title: title.trim() } }, { onSuccess: () => { setTitle(''); setAdding(false); } });
  };

  const tabs: SideTab[] = ms
    ? [
        ...(author ? [{ id: 'ai', label: 'KI-Struktur', content: <ProposalPanel bookId={bookId} ms={ms} /> }] : []),
        { id: 'style', label: 'Stil', content: <StylePanel bookId={bookId} ms={ms} /> },
        { id: 'length', label: 'Umfang', content: <LengthPanel bookId={bookId} ms={ms} /> },
        { id: 'trash', label: `Papierkorb${ms.trash.length ? ` (${ms.trash.length})` : ''}`, content: <TrashPanel bookId={bookId} ms={ms} /> },
        ...(author ? [{ id: 'reviewers', label: 'Lektoren', content: <ReviewerPanel bookId={bookId} ms={ms} /> }] : []),
      ]
    : [];
  const blockCount = ms?.chapters.reduce((n, c) => n + c.blocks.length, 0) ?? 0;

  return (
    <div className="book-page">
      <header className="app-header">
        <Link to="/" className="wordmark">Bookly</Link>
        <nav className="crumbs" aria-label="Pfad">
          <Link to="/">Meine Bücher</Link>
          {ms && author && (<><span aria-hidden="true">/</span><Link to={`/books/${bookId}`}>{ms.book.title}</Link></>)}
          {ms && <span aria-hidden="true">/</span>}
        </nav>
        {ms && <h1>{author ? 'Manuskript' : `${ms.book.title} · Lektorat`}</h1>}
      </header>
      {query.isPending && <p className="muted page-status">Laden …</p>}
      {query.isError && (
        <p className="error page-status" role="alert">
          {query.error instanceof ApiError && query.error.status === 404 ? 'Manuskript nicht gefunden.' : 'Das Manuskript konnte nicht geladen werden.'}
        </p>
      )}
      {ms && (
        <div className="book-layout">
          <main className="ms-main">
            <div className="ms-intro">
              <p className="muted">
                {ms.chapters.length === 0
                  ? 'Noch keine Kapitel.'
                  : `${ms.chapters.length} Kapitel · ${blockCount} ${blockCount === 1 ? 'Baustein' : 'Bausteine'}`}
                {!author && <> · Deine Rechte: {ms.rights.length === 1 ? 'nur Lesen' : ms.rights.length + ' von 6'}</>}
              </p>
              <span className="header-spacer" />
              {ms.chapters.length > 0 && <Link to={`/books/${bookId}/manuskript/vorschau`} className="header-link with-icon"><Icon name="book" />Vorschau des Werks</Link>}
              {ms.rights.includes('structure') && (adding ? (
                <form className="inline-form" onSubmit={addChapter}>
                  <input aria-label="Titel des neuen Kapitels" value={title} maxLength={MANUSCRIPT_LIMITS.title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="Kapiteltitel" />
                  <button type="submit" className="primary">Anlegen</button>
                  <button type="button" onClick={() => setAdding(false)}>Abbrechen</button>
                </form>
              ) : (
                <button type="button" className="with-icon" onClick={() => setAdding(true)}><Icon name="plus" />Kapitel hinzufügen</button>
              ))}
            </div>
            {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
            {ms.chapters.length === 0 && (
              <div className="empty-shelf ms-empty">
                <p className="empty-shelf-title">Dein Buch wartet auf seine Kapitel.</p>
                <p className="muted">
                  {author
                    ? 'Lass dir rechts von der KI eine Struktur aus Storylines, Figuren und Szenen vorschlagen, oder lege selbst ein Kapitel an.'
                    : 'Die Autorin oder der Autor hat noch keine Kapitel angelegt.'}
                </p>
              </div>
            )}
            {ms.chapters.map((c, i) => <ChapterSection key={c.id} bookId={bookId} ms={ms} chapter={c} index={i} />)}
          </main>
          <SidePanel tabs={tabs} activeId={tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id} onActiveChange={setTab} />
        </div>
      )}
    </div>
  );
}
