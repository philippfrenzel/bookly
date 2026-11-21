/**
 * Reading preview of the whole work or one chapter (FR-024, `?kapitel=<id>`): chapter headings and the prose of
 * the Bausteine as continuous text, no tools. Not a print layout (printing is out of scope).
 */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { useManuscript } from './manuscriptApi';

/** The preview page. */
export function PreviewPage() {
  const { bookId = '' } = useParams();
  const [params] = useSearchParams();
  const only = params.get('kapitel');
  const query = useManuscript(bookId);
  const ms = query.data;
  const chapters = ms ? (only ? ms.chapters.filter((c) => c.id === only) : ms.chapters) : [];
  const words = chapters.reduce((n, c) => n + c.blocks.reduce((m, b) => m + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0), 0);
  return (
    <div className="preview-page">
      <header className="app-header">
        <Link to="/" className="wordmark">Bookly</Link>
        <nav className="crumbs" aria-label="Pfad">
          <Link to={`/books/${bookId}/manuskript`} className="with-icon"><Icon name="back" />Zurück zum Manuskript</Link>
        </nav>
        {ms && <h1>Vorschau{only && chapters[0] ? `: ${chapters[0].title}` : ''}</h1>}
      </header>
      {query.isPending && <p className="muted page-status">Laden …</p>}
      {query.isError && <p className="error page-status" role="alert">Die Vorschau konnte nicht geladen werden.</p>}
      {ms && (
        <article className="preview-paper" aria-label="Vorschau">
          {!only && <h1 className="preview-title">{ms.book.title}</h1>}
          <p className="muted preview-facts">
            {chapters.length} Kapitel · etwa {words.toLocaleString('de-DE')} Wörter
            {only && <> · <Link to={`/books/${bookId}/manuskript/vorschau`}>ganzes Werk</Link></>}
          </p>
          {chapters.length === 0 && <p className="muted">Hier gibt es noch nichts zu lesen.</p>}
          {chapters.map((c) => {
            const index = ms.chapters.indexOf(c);
            const filled = c.blocks.filter((b) => b.text.trim());
            return (
              <section key={c.id} className="preview-chapter">
                <h2 className="preview-chapter-title">{!/^kapitel\b/i.test(c.title) && <span>Kapitel {index + 1}</span>}{c.title}</h2>
                {filled.length === 0 && <p className="muted">Dieses Kapitel hat noch keinen Text.</p>}
                {filled.map((b, i) => (
                  <div key={b.id} className="preview-block">
                    {i > 0 && <p className="preview-break" aria-hidden="true">⁂</p>}
                    {b.text.trim().split(/\n\s*\n/).map((para, k) => <p key={k}>{para}</p>)}
                  </div>
                ))}
              </section>
            );
          })}
        </article>
      )}
    </div>
  );
}
