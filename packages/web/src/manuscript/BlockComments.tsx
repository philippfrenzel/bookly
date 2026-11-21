/** Comments on a Baustein: everyone with access reads them, the comment right writes them; own (author: any) can be deleted. */
import { useState, type FormEvent } from 'react';
import { MANUSCRIPT_LIMITS } from '@bookly/shared';
import type { Id, ManuscriptBlock, ManuscriptResponse } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

/** Comment list and form, folded until opened when there are none. */
export function BlockComments({ bookId, ms, block }: { bookId: Id; ms: ManuscriptResponse; block: ManuscriptBlock }) {
  const mutate = useManuscriptMutation(bookId);
  const [open, setOpen] = useState(block.comments.length > 0);
  const [text, setText] = useState('');
  const canWrite = ms.rights.includes('comment');
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) mutate.mutate({ method: 'POST', path: `/blocks/${block.id}/comments`, body: { text: text.trim() } }, { onSuccess: () => setText('') });
  };
  if (!open) {
    return <button type="button" className="link-button ms-comment-toggle" onClick={() => setOpen(true)}>Kommentieren</button>;
  }
  return (
    <section className="ms-comments" aria-label={`Kommentare zu ${block.title}`}>
      <h5 className="scene-label">Kommentare{block.comments.length > 0 && ` (${block.comments.length})`}</h5>
      <ul>
        {block.comments.map((c) => (
          <li key={c.id}>
            <span className="avatar ms-comment-avatar" aria-hidden="true">{c.authorName.trim().charAt(0).toUpperCase()}</span>
            <div>
              <strong>{c.authorName}</strong>{' '}
              <span className="muted">{new Date(c.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <p>{c.text}</p>
            </div>
            {(c.mine || ms.role === 'author') && (
              <button type="button" className="icon-button" aria-label="Kommentar löschen" onClick={() => mutate.mutate({ method: 'DELETE', path: `/blocks/${block.id}/comments/${c.id}` })}>
                <Icon name="close" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form className="inline-form" onSubmit={add}>
          <input aria-label="Neuer Kommentar" value={text} maxLength={MANUSCRIPT_LIMITS.comment} onChange={(e) => setText(e.target.value)} placeholder="Kommentar schreiben …" />
          <button type="submit" disabled={mutate.isPending}>Senden</button>
        </form>
      )}
      {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
    </section>
  );
}
