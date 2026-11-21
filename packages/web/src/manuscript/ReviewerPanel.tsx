/**
 * Reviewer tab (author only): invite registered accounts by e-mail, set their rights individually and remove them;
 * at most 5 per book (FR-005, FR-006, BR-001).
 */
import { useState, type FormEvent } from 'react';
import { MAX_REVIEWERS, REVIEWER_RIGHTS, REVIEWER_RIGHT_LABELS } from '@bookly/shared';
import type { Id, ManuscriptResponse, ReviewerRight } from '@bookly/shared';
import { Icon } from '../ui/Icon';
import { manuscriptError, useManuscriptMutation } from './manuscriptApi';

/** Checkboxes for the rights; `read` is always on. */
function RightsPicker({ value, onChange, idPrefix }: { value: ReviewerRight[]; onChange: (next: ReviewerRight[]) => void; idPrefix: string }) {
  return (
    <fieldset className="ms-rights">
      <legend className="visually-hidden">Rechte</legend>
      {REVIEWER_RIGHTS.map((r) => (
        <label key={r} className="ms-right" htmlFor={`${idPrefix}-${r}`}>
          <input
            id={`${idPrefix}-${r}`}
            type="checkbox"
            checked={r === 'read' || value.includes(r)}
            disabled={r === 'read'}
            onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))}
          />
          {REVIEWER_RIGHT_LABELS[r]}
        </label>
      ))}
    </fieldset>
  );
}

/** The reviewer tab. */
export function ReviewerPanel({ bookId, ms }: { bookId: Id; ms: ManuscriptResponse }) {
  const mutate = useManuscriptMutation(bookId);
  const [email, setEmail] = useState('');
  const [rights, setRights] = useState<ReviewerRight[]>(['read', 'comment', 'suggest']);
  const full = ms.reviewers.length >= MAX_REVIEWERS;
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    mutate.mutate({ method: 'POST', path: '/reviewers', body: { email: email.trim(), rights } }, { onSuccess: () => setEmail('') });
  };
  return (
    <div className="ms-panel">
      <p className="muted">
        Lektoren sehen das Manuskript und arbeiten mit den Rechten mit, die du ihnen gibst. Sie brauchen ein eigenes Bookly-Konto.
        {' '}<strong>{ms.reviewers.length} von {MAX_REVIEWERS}</strong> eingetragen.
      </p>
      <ul className="ms-reviewers">
        {ms.reviewers.map((r) => (
          <li key={r.userId} className="ms-reviewer" aria-label={`Lektor ${r.displayName}`}>
            <div className="ms-reviewer-head">
              <span className="avatar" aria-hidden="true">{r.displayName.trim().charAt(0).toUpperCase()}</span>
              <span><strong>{r.displayName}</strong><br /><span className="muted">{r.email}</span></span>
              <span className="header-spacer" />
              <button type="button" className="icon-button" aria-label={`${r.displayName} entfernen`} onClick={() => mutate.mutate({ method: 'DELETE', path: `/reviewers/${r.userId}` })}>
                <Icon name="trash" />
              </button>
            </div>
            <RightsPicker idPrefix={r.userId} value={r.rights} onChange={(next) => mutate.mutate({ method: 'PATCH', path: `/reviewers/${r.userId}`, body: { rights: next } })} />
          </li>
        ))}
      </ul>
      {full ? (
        <p className="muted">Mehr als {MAX_REVIEWERS} Lektoren pro Buch sind nicht möglich.</p>
      ) : (
        <form className="ms-reviewer-form" onSubmit={add} aria-label="Lektor einladen">
          <label>
            E-Mail des Lektors
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lektor@example.de" />
          </label>
          <RightsPicker idPrefix="neu" value={rights} onChange={setRights} />
          <button type="submit" className="primary" disabled={mutate.isPending}>Einladen</button>
        </form>
      )}
      {mutate.isError && <p className="error" role="alert">{manuscriptError(mutate.error)}</p>}
    </div>
  );
}
