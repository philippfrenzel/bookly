/** Book list section „Als Lektor“: books other authors shared with the signed-in user; each opens its manuscript. */
import { Link } from 'react-router-dom';
import { REVIEWER_RIGHT_LABELS } from '@bookly/shared';
import { useReviews } from './manuscriptApi';

/** Renders nothing when no book is shared with the user. */
export function ReviewedBooks() {
  const reviews = useReviews();
  const list = reviews.data ?? [];
  if (list.length === 0) return null;
  return (
    <section className="shelf ms-reviewed" aria-labelledby="reviewed-title">
      <h2 id="reviewed-title" className="section-title">Als Lektor</h2>
      <ul className="panel-list">
        {list.map((b) => (
          <li key={b.id} className="ms-reviewed-item">
            <Link to={`/books/${b.id}/manuskript`}><strong>{b.title}</strong></Link>
            <span className="muted">von {b.ownerName} · {b.rights.map((r) => REVIEWER_RIGHT_LABELS[r]).join(', ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
