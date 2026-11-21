/** Open reviewer suggestions on a Baustein: the author accepts or rejects (FR-023), the proposer can withdraw. */
import type { Id, ManuscriptBlock, ManuscriptResponse } from '@bookly/shared';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

/** Lists the open suggestions of `block`. */
export function BlockSuggestions({ bookId, ms, block, foreignLock }: { bookId: Id; ms: ManuscriptResponse; block: ManuscriptBlock; foreignLock: boolean }) {
  const mutate = useManuscriptMutation(bookId);
  const author = ms.role === 'author';
  const decide = (id: Id, d: 'accept' | 'reject') => mutate.mutate({ method: 'POST', path: `/blocks/${block.id}/suggestions/${id}/${d}` });
  return (
    <section className="ms-suggestions" aria-label={`Vorschläge zu ${block.title}`}>
      {block.suggestions.map((s) => (
        <article key={s.id} className="ms-suggestion" aria-label={`Vorschlag von ${s.authorName}`}>
          <h5 className="scene-label">Vorschlag von {s.authorName}</h5>
          {s.note && <p className="ms-reason">„{s.note}“</p>}
          {s.baseVersion < block.version && (
            <p className="muted">Beruht auf Version {s.baseVersion}; der Baustein wurde seitdem geändert.</p>
          )}
          {s.title !== block.title && <p><span className="scene-label">Titel</span> {s.title}</p>}
          {s.synopsis !== block.synopsis && <p><span className="scene-label">Inhalt</span> {s.synopsis || '(leer)'}</p>}
          {s.text !== block.text && <div className="ms-text">{s.text || '(leer)'}</div>}
          <div className="actions">
            {author && (
              <button type="button" className="primary" disabled={mutate.isPending || foreignLock} title={foreignLock ? 'Wird gerade bearbeitet.' : undefined} onClick={() => decide(s.id, 'accept')}>
                Übernehmen
              </button>
            )}
            {(author || s.mine) && (
              <button type="button" disabled={mutate.isPending} onClick={() => decide(s.id, 'reject')}>{author ? 'Ablehnen' : 'Zurückziehen'}</button>
            )}
            {!author && <span className="muted">Wartet auf den Autor.</span>}
          </div>
        </article>
      ))}
      {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
    </section>
  );
}
